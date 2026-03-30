import android.os.Bundle;
import android.content.Context;
import android.media.AudioManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // --- BLACKHOLE / MIC UNLOCK UPGRADE ---
        AudioManager audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) {
            // Tells Android to prioritize our app for voice calls
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.setMicrophoneMute(false);
            audioManager.setSpeakerphoneOn(true);
        }
    }
}
