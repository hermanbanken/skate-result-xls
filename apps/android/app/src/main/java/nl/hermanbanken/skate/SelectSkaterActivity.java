package nl.hermanbanken.skate;

import android.app.DatePickerDialog;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.support.v7.app.AppCompatActivity;
import android.text.TextUtils;
import android.util.Log;
import android.util.Pair;
import android.view.KeyEvent;
import android.view.View;
import android.widget.AdapterView;
import android.widget.DatePicker;
import android.widget.EditText;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.SimpleAdapter;

import java.io.IOException;
import java.text.DateFormat;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import butterknife.Bind;
import butterknife.ButterKnife;
import butterknife.OnEditorAction;
import butterknife.OnFocusChange;
import nl.hermanbanken.skate.model.Category;
import nl.hermanbanken.skate.model.ClubMembership;
import nl.hermanbanken.skate.model.SkateDataSource;
import nl.hermanbanken.skate.model.Skater;
import retrofit2.Call;
import retrofit2.GsonConverterFactory;
import retrofit2.Response;
import retrofit2.Retrofit;
import rx.Notification;
import rx.Observable;
import rx.functions.Action1;
import rx.schedulers.Schedulers;

import static rx.android.schedulers.AndroidSchedulers.mainThread;

public class SelectSkaterActivity extends AppCompatActivity implements DatePickerDialog.OnDateSetListener, AdapterView.OnItemClickListener {

    public static final String SKATER = "skaterProfile";

    @Bind(R.id.skater_suggestions)
    public ListView suggestionsList;
    @Bind(R.id.fullname)
    public EditText inputFullName;
    @Bind(R.id.dob)
    public EditText inputDob;
    @Bind(R.id.progressBar)
    public ProgressBar progressBar;

    SkateApiService service;
    List<Set<ProfileSearchResult>> options;

    private static DateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_search_skater);
        ButterKnife.bind(this);

        Retrofit retrofit = new Retrofit.Builder()
                .baseUrl("http://delft.hermanbanken.nl/api/")
                .addConverterFactory(GsonConverterFactory.create())
                .build();
        service = retrofit.create(SkateApiService.class);

        if(getSupportActionBar() != null) {
            getSupportActionBar().setTitle(R.string.activity_search_skater_title);
        }

        List<Pair<String, String>> data = new ArrayList<>();
        options = new ArrayList<>();
        PairAdapter adapter = new PairAdapter(this, data,
                R.layout.listitem_skater_suggestion,
                new int[]{R.id.fullname, R.id.dob}
        );
        suggestionsList.setAdapter(adapter);
        suggestionsList.setOnItemClickListener(this);

        rx.Observable.combineLatest(
                TextWatcher.rxFromTextView(inputFullName),
                TextWatcher.rxFromTextView(inputDob).map(SelectSkaterActivity::parseDate).startWith(Observable.just(null)).retry(),
                Pair::create)
                .distinctUntilChanged()
                .debounce(500, TimeUnit.MILLISECONDS, mainThread())
                .doOnNext(p -> Log.i("Rx", "Read" + p.first + " " + p.second))
                .doOnEach(n -> SelectSkaterActivity.counter(1, progressBar).call(n))
                // Elsewhere
                .observeOn(Schedulers.newThread())
                .map(this::search)
                // Back on main
                .observeOn(mainThread())
                .doOnEach(n -> SelectSkaterActivity.counter(-1, progressBar).call(n))
                .retry((i, e) -> Log.i("Exception", "Restarting Rx chain", e) < Integer.MAX_VALUE)
                .subscribe(i -> {
                    data.clear();
                    for (Set<ProfileSearchResult> set : i.values()) {
                        List<ProfileSearchResult> results = new ArrayList<>(set);

                        String first = String.format("%s (%s)", results.get(0).name, results.get(0).currentCategory);
                        String second = results.get(0).birthdate;

                        Set<String> clubs = new HashSet<>();
                        for (ProfileSearchResult result : results) {
                            if(result.club != null && !result.club.isEmpty())
                                clubs.add(result.club);
                        }
                        if(!clubs.isEmpty())
                            second += ", " + TextUtils.join(", ", clubs);
                        data.add(Pair.create(first, second));
                    }
                    options.clear();
                    options.addAll(i.values());
                    adapter.notifyDataSetChanged();
                });
    }

    static final int[] count = {0};
    static Action1<Notification<?>> counter(int mod, ProgressBar bar) {
        return (notification) -> {
            if(!notification.isOnCompleted()) {
                count[0] += mod;
                bar.setVisibility(count[0] == 0 ? View.INVISIBLE : View.VISIBLE);
            }
            Log.i("Rx", "Counter == " + count[0]);
        };
    }

    public Map<Category,Set<ProfileSearchResult>> search(Pair<String,Date> nameAndDate) throws RuntimeException {
        String dateString = nameAndDate.second == null ? null : dateFormat.format(nameAndDate.second);
        Pair <String,String> name = SkaterSuggestion.splitFullName(nameAndDate.first);
        try {
            Call<List<ProfileSearchResult>> call = service.search(name.first, name.second, dateString);
            Response<List<ProfileSearchResult>> response = call.execute();

            HashMap<Category, Set<ProfileSearchResult>> map = new HashMap<>();

            // Add profiles which certain category
            for (ProfileSearchResult result : response.body()) {
                Category cat = result.category();
                if (cat == null) {
                    continue;
                }
                map.put(cat, new LinkedHashSet<>());
                map.get(cat).add(result);
            }

            // Add profiles which uncertain category
            for (ProfileSearchResult result : response.body()) {
                if (result.category() != null) {
                    continue;
                }
                int added = 0;
                for(Category cat : result.possibleCategories()) {
                    for(Category key : map.keySet()) {
                        if(Category.couldBeEqual(key, cat)) {
                            added++;
                            map.get(key).add(result);
                        }
                    }
                }
                if(added == 0) {
                    Category undef = new Category(Category.CategoryBase.UNDEFINED);
                    if(!map.containsKey(undef)) {
                        map.put(undef, new LinkedHashSet<>());
                    }
                    map.get(undef).add(result);
                }
            }

            return map;
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    // Prevent key events
    @OnEditorAction(R.id.dob)
    boolean onEditorAction(KeyEvent key) {
        return key.getCharacters().length() == 0;
    }

    // Listen to focus
    @OnFocusChange(R.id.dob)
    void onDateFocus(boolean focus) {
        Date current = parseDate(inputDob.getText().toString());
        current = current != null ? current : new Date();

        if(focus) {
            GregorianCalendar cal = new GregorianCalendar();
            cal.setTime(current);
            DatePickerDialog dialog = new DatePickerDialog(
                    this, this,
                    cal.get(GregorianCalendar.YEAR),
                    cal.get(GregorianCalendar.MONTH),
                    cal.get(GregorianCalendar.DAY_OF_MONTH)
            );
            dialog.show();
        }
    }

    // Handle new dates
    @Override
    public void onDateSet(DatePicker view, int year, int monthOfYear, int dayOfMonth) {
        Date date = new GregorianCalendar(year, monthOfYear, dayOfMonth).getTime();
        inputDob.setText(dateFormat.format(date));
    }

    static Date parseDate(String input) {
        try {
            return dateFormat.parse(input);
        } catch (NullPointerException | ParseException e) {
            return null;
        }
    }

    @Override
    public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
        Intent intent = new Intent();
        Set<ProfileSearchResult> set = options.get(position);
        Skater skater = null;
        for(ProfileSearchResult result : set) {
            if(skater == null) {
                skater = new Skater();
                skater.category = result.category();
                skater.name = result.name;
            }
            skater.dataSources.add(new SkateDataSource(result.type, result.code));
            if(result.club != null && !result.club.isEmpty()) {
                ClubMembership clubMembership = new ClubMembership(result.club);
                skater.memberships.add(clubMembership);
                if (result.categories.size() > 0) {
                    clubMembership.fromSeason = result.categories.get(0).season;
                }
                if (result.categories.size() > 1) {
                    clubMembership.toSeason = result.categories.get(1).season;
                }
            }
        }

        intent.putExtra(SKATER, skater);
        if(getParent() == null) {
            setResult(RESULT_OK, intent);
        } else {
            getParent().setResult(RESULT_OK, intent);
        }
        finish();
    }

    public static class PairAdapter extends SimpleAdapter {
        private final List<Map<String, Object>> upstreamData;
        private List<Pair<String, String>> originalInput;

        /**
         * Constructor
         *
         * @param context  The context where the View associated with this PairAdapter is running
         * @param data     A List of Pairs. Each entry in the List corresponds to one row in the list. The
         *                 Pair contain the data for each row.
         * @param resource Resource identifier of a view layout that defines the views for this list
         *                 item. The layout file should include at least those named views defined in "to"
         * @param to       The views that should display first and second rows. These should all be
         *                 TextViews. The first 2 views in this list are given the values.
         */
        public PairAdapter(Context context, List<Pair<String, String>> data, int resource, int[] to) {
            this(context, convert(data), resource, to, true);
            originalInput = data;
        }

        protected PairAdapter(Context context, List<Map<String, Object>> data, int resource, int[] to, boolean ignored) {
            super(context, data, resource, new String[] {"f", "s"}, to);
            upstreamData = data;
        }

        private static List<Map<String,Object>> convert(List<Pair<String, String>> input) {
            List<Map<String,Object>> list = new ArrayList<>();
            for(Pair<String,String> p : input) {
                HashMap<String, Object> map = new HashMap<>();
                map.put("f", p.first);
                map.put("s", p.second);
                list.add(map);
            }
            return list;
        }

        @Override
        public void notifyDataSetChanged() {
            upstreamData.clear();
            upstreamData.addAll(convert(originalInput));
            super.notifyDataSetChanged();
        }
    }
}
