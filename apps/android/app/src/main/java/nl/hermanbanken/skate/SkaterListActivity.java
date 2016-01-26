package nl.hermanbanken.skate;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.PersistableBundle;
import android.support.v7.app.AppCompatActivity;
import android.util.Log;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.TextView;

import com.cesarferreira.rxpaper.RxPaper;

import java.util.ArrayList;
import java.util.List;

import butterknife.Bind;
import butterknife.ButterKnife;
import nl.hermanbanken.skate.model.Skater;
import rx.Observable;
import rx.functions.Func1;

import static rx.android.schedulers.AndroidSchedulers.mainThread;

public class SkaterListActivity extends AppCompatActivity {

    public static final String FIELD = "skaters";
    @Bind(R.id.skater_list)
    public ListView list;

    private List<Skater> data = new ArrayList<>();
    Adapter<Skater> adapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        init();
    }

    @Override
    public void onCreate(Bundle savedInstanceState, PersistableBundle persistentState) {
        super.onCreate(savedInstanceState, persistentState);
        init();
    }

    private Observable<ArrayList<Skater>> skaters;

    private void init() {
        setContentView(R.layout.activity_skaters_list);
        ButterKnife.bind(this);
        skaters = RxPaper.with(this).read(FIELD, new ArrayList<Skater>());

        Skater skaterA = new Skater();
        Skater skaterB = new Skater();
        Skater skaterC = new Skater();
        skaterA.name = "Herman Banken";
        skaterB.name = "Sven Kramer";
        skaterC.name = "Erik Jansen";
        data.add(skaterA);
        data.add(skaterB);
        data.add(skaterC);

        adapter = new Adapter<>(this, data, skater -> skater.name, skater -> skater.category != null ? skater.category.toString() : "");
        list.setAdapter(adapter);

        reload();
    }

    public class Adapter<T> extends ArrayAdapter<T> {

        private final Func1<T, String> firstLine;
        private final Func1<T, String> secondLine;

        public Adapter(Context context, List<T> objects, Func1<T, String> firstLine, Func1<T, String> secondLine) {
            super(context, -1, objects);
            this.firstLine = firstLine;
            this.secondLine = secondLine;
        }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            View view = getLayoutInflater().inflate(R.layout.listitem_skater_suggestion, parent, false);

            TextView first = (TextView) view.findViewById(R.id.fullname);
            TextView second = (TextView) view.findViewById(R.id.dob);
            first.setText(firstLine.call(getItem(position)));
            second.setText(secondLine.call(getItem(position)));

            return view;
        }
    }

    public boolean onCreateOptionsMenu(Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.menu, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        switch (item.getItemId()) {
            case R.id.action_add:
                Intent intent = new Intent(this, SelectSkaterActivity.class);
                startActivityForResult(intent, 0);
                return true;

            default:
                return super.onOptionsItemSelected(item);
        }
    }

    private void reload() {
        skaters.subscribe(skaters -> {
            data.clear();
            data.addAll(skaters);
            adapter.notifyDataSetChanged();
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent intent) {
        switch (requestCode) {
            case 0:
                if(resultCode != RESULT_OK)
                    return;

                Skater skater = (Skater) intent.getSerializableExtra(SelectSkaterActivity.SKATER);
                skaters.flatMap(skaters -> {
                            skaters.add(skater);
                            return RxPaper.with(this).write(FIELD, skaters);
                        }).subscribe(result2 -> {
                            RxPaper.with(this).exists(FIELD).subscribe(result -> {
                                Log.i("Storage", String.format("Storage now %b exists", result));
                            });
                            reload();
                        });
                break;
            default:
                super.onActivityResult(requestCode, resultCode, intent);
        }
    }
}
