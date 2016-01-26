package nl.hermanbanken.skate.model;

import java.io.Serializable;

public class ClubMembership implements Serializable {
    public String club;
    public int fromSeason;
    public int toSeason;

    public ClubMembership(String club) {
        this.club = club;
    }

    public ClubMembership() {}
}
