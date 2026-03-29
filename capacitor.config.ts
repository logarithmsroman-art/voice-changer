import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voiceshift.app',
  appName: 'VoiceShift',
  webDir: 'out',
  server: {
    url: 'https://voice-changer-3vo.pages.dev',
    cleartext: true
  }
};

export default config;
