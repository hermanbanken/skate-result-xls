package nl.hermanbanken.skate.model;

import android.os.Build;
import android.support.annotation.NonNull;

import org.joda.time.LocalDate;
import org.joda.time.Years;

import java.io.Serializable;
import java.util.Date;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class Category implements Comparable<Category>, Serializable {
    public CategoryBase base;
    public int yearIn;

    public Category() {
        base = CategoryBase.UNDEFINED;
        yearIn = -1;
    }

    public Category(CategoryBase base) {
        this.base = base;
        yearIn = -1;
    }

    Category(CategoryBase base, int yearIn) {
        this.base = base;
        this.yearIn = yearIn;
    }

    Category next() {
        if (base.ordinal() >= CategoryBase.values().length) {
            return this;
        }
        return new Category(CategoryBase.values()[base.ordinal() + 1]);
    }

    public static Set<Category> advance(Category category, int year, int toYear) {
        Set<Category> possibilities = new HashSet<>();
        if(category.yearIn >= 0) {
            possibilities.add(category.next(toYear - year));
        } else {
            for (int i = 0; i < category.base.duration; i++) {
                possibilities.add(category.withYearIn(i).next(toYear - year));
            }
        }
        return possibilities;
    }

    private Category next(int advanceYears) {
        if (advanceYears < 0)
            throw new IllegalArgumentException("advanceYears should be greater or equal to zero.");
        if (advanceYears == 0) return this;

        int offset = yearIn == -1 ? 0 : yearIn;
        if (base.duration > advanceYears + offset) {
            return this.withYearIn(offset + advanceYears);
        } else {
            return next().next(advanceYears + offset - base.duration);
        }
    }

    public static Category categoryAtAge(int age) {
        for (int i = 0; i < CategoryBase.values().length; i++) {
            if (age < CategoryBase.values()[i].duration) {
                return new Category(CategoryBase.values()[i], age);
            }
            age -= CategoryBase.values()[i].duration;
        }
        return new Category(CategoryBase.M70, age);
    }

    public Category withYearIn(int yearIn) {
        return new Category(base, yearIn);
    }

    public static Category categoryForBirthDate(Date date) {
        Years years = Years.yearsBetween(LocalDate.fromDateFields(date), new LocalDate());
        return categoryAtAge(years.getYears());
    }

    public static boolean exactMatch(Category a, Category b) {
        return a.base == b.base && a.yearIn == b.yearIn;
    }

    public static boolean couldBeEqual(Category a, Category b) {
        if (a.base.ordinal() != b.base.ordinal())
            return false;
        if (a.yearIn >= 0 && b.yearIn >= 0 && a.yearIn != b.yearIn)
            return false;
        return true;
    }

    @Override
    public boolean equals(Object o) {
        if(o instanceof Category) {
            Category other = (Category) o;
            return exactMatch(this, other);
        }
        return false;
    }

    @Override
    public int hashCode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            return Objects.hash(this.base, yearIn);
        }
        return this.base.hashCode() * 10 + yearIn;
    }

    public static Category parse(String input) {
        if (input == null)
            return new Category(CategoryBase.UNDEFINED);

        if (input.length() >= 2 && input.matches(".*\\d{2}$")) {
            int master = Integer.parseInt(input.substring(input.length() - 2));
            if (master > 39 && master % 5 == 0 && master < 71) {
                return new Category(CategoryBase.valueOf("M" + master));
            }
        }

        if ("DHMF".contains("" + input.charAt(0))) {
            return parse(input.substring(1));
        }

        if (input.matches("([A-C]|N)\\d")) {
            int year = Integer.parseInt(input.substring(input.length() - 1)) - 1;
            return new Category(CategoryBase.valueOf(input.substring(0, input.length() - 1)), year);
        }

        if (input.matches("P?[A-F]|S[A-B]")) {
            return new Category(CategoryBase.valueOf(input));
        }

        return new Category(CategoryBase.UNDEFINED);
    }

    @Override
    public String toString() {
        return (yearIn == -1 || base.hideYear ? base.name() : base.name() + (yearIn + 1)).substring(base.stripChar ? 1 : 0);
    }

    @Override
    public int compareTo(@NonNull Category another) {
        if(base == another.base && yearIn == another.yearIn)
            return 0;
        if(base.compareTo(another.base) != 0)
            return base.compareTo(another.base);
        else
            return another.yearIn - yearIn;
    }

    public enum CategoryBase implements Serializable {
        UNDEFINED(7),
        PF(1),
        PE(1),
        PD(1),
        PC(1),
        PB(1),
        PA(1),
        C(2, false),
        B(2, false),
        A(2, false),
        N(4, false),
        SA(7),
        SB(9),
        M40(5),
        M45(5),
        M50(5),
        M55(5),
        M60(5),
        M65(5),
        M70(30, false);

        private final int duration;
        private final boolean hideYear;
        private final boolean stripChar;
        private int yearIn = -1;

        CategoryBase(int duration) {
            this(duration, true, false);
        }

        CategoryBase(int duration, boolean hideYear) {
            this(duration, hideYear, false);
        }

        CategoryBase(int duration, boolean hideYear, boolean stripChar) {
            this.duration = duration;
            this.hideYear = hideYear;
            this.stripChar = stripChar;
        }
    }
}


