package nl.hermanbanken.skate;

import android.util.Pair;

import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class SkaterSuggestion {
    public String givenName;
    public String familyName;
    public Date dateOfBirth;
    public String country;
    public Gender gender;

    public SkaterSuggestion() {}

    public SkaterSuggestion(String givenName, String familyName, Date dob) {
        this.givenName = givenName;
        this.familyName = familyName;
        this.dateOfBirth = dob;
    }

    public SkaterSuggestion withFullName(String fullName) {
        Pair<String,String> name = splitFullName(fullName);
        SkaterSuggestion s = new SkaterSuggestion();
        s.familyName = name.second;
        s.givenName = name.first;
        s.dateOfBirth = dateOfBirth;
        s.country = country;
        s.gender = gender;
        return s;
    }

    public SkaterSuggestion withDob(Date dob) {
        SkaterSuggestion s = new SkaterSuggestion();
        s.familyName = familyName;
        s.givenName = givenName;
        s.dateOfBirth = dob;
        s.country = country;
        s.gender = gender;
        return s;
    }

    public Map<String,String> toListViewMap() {
        DateFormat df = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault());
        String dob = dateOfBirth == null ? "" : df.format(dateOfBirth);
        return new HashMap<String,String>() {{
            put("fullName", givenName + ' ' + familyName);
            put("dob", dob);
            put("first_line", givenName + ' ' + familyName);
            put("second_line", String.format("%s, %s, %s", dob));
        }};
    }

    public static Pair<String,String> splitFullName(String fullName) {
        String familyName; String givenName;
        if (fullName.contains(",")) {
            familyName = fullName.substring(0, fullName.indexOf(',')).trim();
            givenName = fullName.substring(fullName.indexOf(',') + 1).trim();
        } else if(fullName.contains(" ")) {
            familyName = fullName.substring(fullName.indexOf(' ') + 1).trim();
            givenName = fullName.substring(0, fullName.indexOf(' ')).trim();
        } else {
            givenName = fullName;
            familyName = null;
        }
        return Pair.create(givenName, familyName);
    }
}
