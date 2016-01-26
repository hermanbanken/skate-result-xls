package nl.hermanbanken.skate;

import java.util.List;
import retrofit2.Call;
import retrofit2.http.GET;
import retrofit2.http.Query;

public interface SkateApiService {
    @GET("skaters/find")
    Call<List<ProfileSearchResult>> search(@Query("first_name") String first_name, @Query("last_name") String last_name, @Query("birthdate") String birth_date);
}
