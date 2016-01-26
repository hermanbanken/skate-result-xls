package nl.hermanbanken.skate.model;

import java.io.Serializable;

import nl.hermanbanken.skate.ProfileSearchResult;

public class SkateDataSource implements Serializable {
    public ProfileSearchResult.ServiceType type;
    public String code;

    public SkateDataSource(ProfileSearchResult.ServiceType type, String code) {
        this.type = type;
        this.code = code;
    }

    public SkateDataSource() {}
}
