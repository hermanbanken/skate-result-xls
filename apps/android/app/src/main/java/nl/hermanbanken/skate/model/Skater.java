package nl.hermanbanken.skate.model;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

public class Skater implements Serializable {
    public String name;
    public Category category;
    public final List<ClubMembership> memberships;
    public final List<SkateDataSource> dataSources;

    public Skater() {
        memberships = new ArrayList<>();
        dataSources = new ArrayList<>();
    }
}
