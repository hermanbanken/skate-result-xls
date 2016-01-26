package nl.hermanbanken.skate;

import android.text.Editable;
import android.widget.EditText;

import rx.Observable;
import rx.Subscriber;

public class TextWatcher implements android.text.TextWatcher {

    private Subscriber<? super String> subscriber;

    public TextWatcher subscriber(Subscriber<? super String> s) {
        this.subscriber = s;
        return this;
    }

    public TextWatcher(EditText e) {
        e.addTextChangedListener(this);
    }

    @Override
    public void beforeTextChanged(CharSequence s, int start, int count, int after) {

    }

    @Override
    public void onTextChanged(CharSequence s, int start, int before, int count) {
        if(subscriber != null)
            subscriber.onNext(String.valueOf(s));
    }

    @Override
    public void afterTextChanged(Editable s) {

    }

    public static rx.Observable<String> rxFromTextView(EditText resource) {
        return rx.Observable.using(
                () -> new TextWatcher(resource),
                sub -> rx.Observable.create((Observable.OnSubscribe<String>) sub::subscriber),
                resource::removeTextChangedListener
        );
    }
}