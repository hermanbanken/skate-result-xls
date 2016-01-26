package nl.hermanbanken.skate;

import com.google.gson.annotations.SerializedName;

import java.text.DateFormat;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import nl.hermanbanken.skate.model.Category;

public class ProfileSearchResult {
    private static DateFormat birthDateFormat = new SimpleDateFormat("yyyy-MM-dd");

    // Which type
    @SerializedName("type")
    public ServiceType type;
    public String code;

    public String name;
    public String club;

    public List<CategoryField> categories;

    public Category category() {
        if (currentCategory != null) {
            return Category.parse(currentCategory);
        }
        if (birthdate != null) {
            try {
                return Category.categoryForBirthDate(birthDateFormat.parse(birthdate));
            } catch (ParseException e) {
                e.printStackTrace();
            }
        }
        return null;
    }

    // SSR only
    @SerializedName("current_category")
    public String currentCategory;
    public String birthdate;

    static class CategoryField {
        public int season;
        public String category;

        CategoryField(String category, int season) {
            this.category = category;
            this.season = season;
        }
    }

    static int currentSeason() {
        GregorianCalendar cal = new GregorianCalendar();
        if(cal.get(Calendar.MONTH) < GregorianCalendar.JULY) {
            return cal.get(Calendar.YEAR) - 1;
        }
        return cal.get(Calendar.YEAR);
    }

    public Set<Category> possibleCategories() {
        Set<Category> set = new HashSet<>();

        if(currentCategory != null) {
            set.add(Category.parse(currentCategory));
        }

        if(categories != null) {
            for(CategoryField field : categories) {
                Set<Category> cats = Category.advance(Category.parse(field.category), field.season, currentSeason());
                if(set.isEmpty())
                    set.addAll(cats);
                else
                    set.retainAll(cats);
            }
        }

        set.remove(new Category(Category.CategoryBase.UNDEFINED));
        return set;
    }

    public enum ServiceType {
        @SerializedName("ssr")
        SSR,
        @SerializedName("osta")
        OSTA
    }

}
