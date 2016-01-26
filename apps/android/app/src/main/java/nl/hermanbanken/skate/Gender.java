package nl.hermanbanken.skate;

public enum Gender {
    MALE("m"),
    FEMALE("f"),
    OTHER("o");

    String shortVersion;
    Gender(String m) {
        shortVersion = m;
    }
}
