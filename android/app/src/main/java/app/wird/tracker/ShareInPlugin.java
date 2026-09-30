package app.wird.tracker;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Receives text shared into Wird from other apps (for example a group's daily portion message in WhatsApp).
 * A share that arrives before the web app is ready is kept until the app asks for it with take().
 */
@CapacitorPlugin(name = "ShareIn")
public class ShareInPlugin extends Plugin {
    private static String pending;

    static String textFrom(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return null;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text == null) return null;
        String s = text.toString();
        return s.length() > 5000 ? s.substring(0, 5000) : s;
    }

    @Override
    public void load() {
        String text = textFrom(getActivity().getIntent());
        if (text != null) pending = text;
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String text = textFrom(intent);
        if (text == null) return;
        pending = text;
        JSObject data = new JSObject();
        data.put("text", text);
        notifyListeners("shared", data, true);
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("text", pending);
        pending = null;
        call.resolve(ret);
    }
}
