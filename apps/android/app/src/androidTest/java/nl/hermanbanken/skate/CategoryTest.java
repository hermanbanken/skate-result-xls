package nl.hermanbanken.skate;

import android.app.Application;
import android.support.test.runner.AndroidJUnit4;
import android.test.ApplicationTestCase;
import android.test.suitebuilder.annotation.SmallTest;
import android.util.Log;

import org.junit.Assert;
import org.junit.Test;
import org.junit.runner.RunWith;

import nl.hermanbanken.skate.model.Category;
import nl.hermanbanken.skate.model.Category.CategoryBase;

@RunWith(AndroidJUnit4.class)
@SmallTest
public class CategoryTest extends ApplicationTestCase<Application> {
    public CategoryTest() {
        super(Application.class);
    }

    @Test
    public void test(){
        String testResult = "";
        for(int i = 0; i <= 100; i++) {
            testResult += String.format("%d -> %s\n", i, Category.categoryAtAge(i));
        }
        Log.i("Categories", testResult);
        Assert.assertSame(Category.categoryAtAge(17), new Category(CategoryBase.A));
        Assert.assertSame(Category.categoryAtAge(19), new Category(CategoryBase.N));
        Assert.assertSame(Category.categoryAtAge(22), new Category(CategoryBase.N));
        Assert.assertSame(Category.categoryAtAge(23), new Category(CategoryBase.SA));
    }

    public void testAdvance() {
        Assert.assertSame(Category.advance(new Category(CategoryBase.N, 3), 2013, 2015), new Category(CategoryBase.SA));
    }
}