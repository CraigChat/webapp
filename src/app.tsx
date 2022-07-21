import { Component } from 'preact';
import { Translation } from 'react-i18next';

import Dropdown from './components/common/dropdown';
import { Modal } from './components/disconnectModal';
import { LoginPanel } from './components/login';
import { MonitoringPanel } from './components/monitoring';
import { OnboardingPanel } from './components/onboarding';
import { RecordingPanel } from './components/recording';
import { Recording } from './util/api';
import { capture } from './util/audio';
import { dataSock, monitorSock, pingSock } from './util/audio/net';
import { procInterval } from './util/audio/processing';
import { UserExtraType } from './util/audio/protocol';
import { pushMax } from './util/audio/waveform';
import { addListener, removeAllListenersFromKey, removeListener } from './util/events';
import { languages } from './util/i18n';
import { makeLogger } from './util/logger';

export const logger = makeLogger('app');

export interface AppUser {
  id: number;
  nick: string;
  avatar?: string;
}

interface AppState {
  modalOpen: boolean;
  disconnectReason: string;

  recordingId: string;
  ennuiKey: string;
  server: string;
  autoLogin: boolean;
  loginAttempted: boolean;

  recording: Recording | null;

  nickname: string | null;
  flac: boolean | null;
  continuous: boolean | null;
  noiseSupression: boolean;

  vad: boolean;
  rawVad: boolean;
  users: AppUser[];
  usersSpeaking: { [id: number]: boolean };
  myId: number;
  mediaReady: boolean;
  deviceId?: string;

  connected: boolean;
  connectionType: 'record' | 'monitor' | null;
}

export class App extends Component<Record<string, never>, AppState> {
  constructor() {
    super();

    const params = new URLSearchParams(window.location.search);

    this.state = {
      modalOpen: false,
      disconnectReason: '',

      recordingId: params.get('id') || '',
      ennuiKey: params.get('key') || '',
      server: params.get('server') || '',
      autoLogin: !!(params.get('id') && params.get('key')),
      loginAttempted: false,

      recording: null,

      nickname: null,
      flac: null,
      continuous: null,
      noiseSupression: localStorage.getItem('noiseSuppression') === 'true',

      vad: false,
      rawVad: false,
      users: [],
      usersSpeaking: {},
      myId: -1,
      mediaReady: false,

      connected: false,
      connectionType: null
    };

    logger.log('Loaded');
  }

  componentDidMount() {
    addListener('app', 'connected', (connected) => this.setState({ connected }));
    addListener('app', 'vad', (vad) => this.setState({ vad }));
    addListener('app', 'rawVad', (rawVad) => this.setState({ rawVad }));
    addListener('app', 'max', (val) => pushMax(val, this.state.vad, this.state.rawVad));
    addListener('app', 'recId', (myId) => this.setState({ myId }));
    addListener('app', 'speech', (user, speaking) => {
      // if (!user && speaking) updateWaveRetroactive();
      if (user !== null) {
        if (!this.state.users.find((u) => u.id === user)) return;
        this.setState({
          usersSpeaking: {
            ...this.state.usersSpeaking,
            [user]: speaking
          }
        });
      }
    });
    addListener('app', 'user', (track, nick, status) => {
      // User disconnected
      if (!status) {
        if (this.state.users.find((u) => u.id === track))
          this.setState({
            users: this.state.users.filter((user) => user.id !== track)
          });
        return;
      }

      // User connected
      const otherUsers = this.state.users.filter((user) => user.id !== track);
      this.setState({
        users: [...otherUsers, { id: track, nick }]
      });
    });
    addListener('app', 'userExtra', (track, type, data) => {
      if (!this.state.users.find((u) => u.id === track)) return;
      if (type === UserExtraType.AVATAR) {
        const users = this.state.users.map((u) => {
          if (u.id === track) return { ...u, avatar: data };
          return u;
        });
        this.setState({ users });
      }
    });
    addListener('app', 'userMediaReady', (deviceId) => this.setState({ mediaReady: true, deviceId }));
    addListener('app', 'userMediaStopped', () => this.setState({ mediaReady: false }));
  }

  componentWillUnmount() {
    removeAllListenersFromKey('app');
  }

  onDisconnect(e?: CloseEvent) {
    logger.log('Disconnected.', e);

    // Clear audio processing
    if (procInterval) clearInterval(procInterval);
    removeListener('processing', 'userMediaStopped');
    capture?.disconnect();
    dataSock?.close();
    pingSock?.close();
    monitorSock?.close();

    let reason = '';
    if (e?.reason) reason = e.reason;
    this.setState({ modalOpen: true, disconnectReason: reason });
  }

  render() {
    let panel = null;

    if (!this.state.recording)
      panel = (
        <LoginPanel
          recordingId={this.state.recordingId}
          ennuiKey={this.state.ennuiKey}
          server={this.state.server}
          autoLogin={this.state.autoLogin}
          loginAttempted={this.state.loginAttempted}
          setLoginAttempted={(loginAttempted: boolean) => this.setState({ loginAttempted })}
          setRecording={(recording: Recording, server: string) => this.setState({ recording, server })}
        />
      );
    else if (!this.state.connected)
      panel = (
        <OnboardingPanel
          recording={this.state.recording}
          server={this.state.server}
          hasConnected={this.state.connected}
          onBack={() => this.setState({ recording: null })}
          onDisconnect={(e) => this.onDisconnect(e)}
          setAttributes={(connectionType, nickname, flac, continuous, noiseSupression) =>
            this.setState({ connectionType: connectionType as any, nickname, flac, continuous, noiseSupression })
          }
        />
      );
    else if (this.state.connected && this.state.connectionType === 'record')
      panel = (
        <RecordingPanel
          recording={this.state.recording}
          username={this.state.nickname}
          flac={this.state.flac}
          continuous={this.state.continuous}
          vad={this.state.vad}
          users={this.state.users}
          usersSpeaking={this.state.usersSpeaking}
          myId={this.state.myId}
          mediaReady={this.state.mediaReady}
        />
      );
    else panel = <MonitoringPanel recording={this.state.recording} users={this.state.users} usersSpeaking={this.state.usersSpeaking} />;

    return (
      <Translation>
        {(t, { i18n }) => (
          <>
            <div class="min-h-screen bg-gradient-to-t from-neutral-800 to-zinc-900 text-white font-body flex items-center justify-center flex-col py-12 sm:px-12">
              {panel}
              <div class="flex justify-end w-full sm:w-4/5 sm:max-w-4xl pr-2 sm:pr-0">
                {languages.length > 1 ? (
                  <Dropdown
                    right
                    bottom
                    items={languages}
                    selected={languages.find((l) => l.value === i18n.language)}
                    onSelect={(lang) => {
                      localStorage.setItem('i18nextLng', lang.value);
                      i18n.changeLanguage(lang.value);
                    }}
                  />
                ) : (
                  ''
                )}
              </div>
            </div>
            <Modal open={this.state.modalOpen} reason={this.state.disconnectReason} />
          </>
        )}
      </Translation>
    );
  }
}
