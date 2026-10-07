import { useRef, useState } from 'react';
import { useApp } from '../state';
import { Button, Chip, Segmented, Slider, SwitchRow, TopBar } from '../components/ui';
import { PlayIcon } from '../components/Icons';
import { SELECTABLE_INSTRUMENTS } from '../../audio/instruments';
import { exportProfile, importProfile, saveProfile } from '../../learning/store';
import { realiseProgression, requireProgression } from '../../music/progressions';
import { voiceProgression } from '../../music/voicing';
import { Performer } from '../../audio/performer';
import type { Accidental } from '../../music/pitch';

export function Settings({ onBack }: { onBack: () => void }) {
  const { settings, updateSettings, profile, setProfile, resetProfile, storageOk, unlockAudio, performer } =
    useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** A ii–V–I so the voices can be judged on something musical. */
  const preview = async () => {
    await unlockAudio();
    performer.stop();
    performer.configure({
      instrument: settings.instrument,
      tempo: settings.tempo,
      swing: settings.swing,
    });
    const def = requireProgression('ii-V-I');
    const realised = realiseProgression(def, 5);
    const voicings = voiceProgression(realised.map((r) => r.chord), { style: 'spread', maxNotes: 5 });
    performer.progression(Performer.changes(realised, voicings), performer.origin(), {
      style: 'comp',
    });
  };

  const download = () => {
    try {
      const blob = new Blob([exportProfile(profile)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ears-history-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('History downloaded.');
    } catch {
      setMessage('Could not export on this browser.');
    }
  };

  const upload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const next = importProfile(String(reader.result ?? ''));
      if (!next) {
        setMessage('That file could not be read as practice history.');
        return;
      }
      setProfile(next);
      saveProfile(next);
      setMessage('History restored.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="stack">
      <TopBar title="Settings" onBack={onBack} />

      <section className="card stack">
        <div className="row row--between">
          <span className="eyebrow">Sound</span>
          <Button size="sm" onClick={() => void preview()}>
            <PlayIcon size={16} />
            Preview
          </Button>
        </div>
        <div className="field">
          <div className="field__label">
            <span>Voice</span>
          </div>
          <div className="row row--wrap" style={{ gap: '0.35rem' }}>
            {SELECTABLE_INSTRUMENTS().map((inst) => (
              <Chip
                key={inst.id}
                on={settings.instrument === inst.id}
                onClick={() => updateSettings({ instrument: inst.id })}
              >
                {inst.name}
              </Chip>
            ))}
          </div>
          <p className="small faint" style={{ marginTop: '0.35rem' }}>
            {SELECTABLE_INSTRUMENTS().find((i) => i.id === settings.instrument)?.description}
          </p>
        </div>

        <Slider
          label="Volume"
          min={0}
          max={100}
          value={Math.round(settings.volume * 100)}
          onChange={(v) => updateSettings({ volume: v / 100 })}
          format={(v) => `${v}%`}
        />
        <Slider
          label="Room"
          min={0}
          max={100}
          value={Math.round(settings.reverb * 100)}
          onChange={(v) => updateSettings({ reverb: v / 100 })}
          format={(v) => `${v}%`}
        />
        <Slider
          label="Tempo"
          min={60}
          max={220}
          value={settings.tempo}
          onChange={(v) => updateSettings({ tempo: v })}
          format={(v) => `${v} bpm`}
        />
        <Slider
          label="Swing"
          min={0}
          max={100}
          value={Math.round(settings.swing * 100)}
          onChange={(v) => updateSettings({ swing: v / 100 })}
          format={(v) => (v === 0 ? 'Straight' : `${v}%`)}
        />
      </section>

      <section className="card stack">
        <span className="eyebrow">Display</span>
        <div className="field">
          <div className="field__label">
            <span>Theme</span>
          </div>
          <Segmented
            ariaLabel="Theme"
            value={settings.theme}
            options={[
              { value: 'auto' as const, label: 'Auto' },
              { value: 'dark' as const, label: 'Dark' },
              { value: 'light' as const, label: 'Light' },
            ]}
            onChange={(v) => updateSettings({ theme: v })}
          />
        </div>
        <div className="field">
          <div className="field__label">
            <span>Note names</span>
          </div>
          <Segmented
            ariaLabel="Note names"
            value={settings.accidental}
            options={[
              { value: 'both' as Accidental, label: 'Mixed' },
              { value: 'sharp' as Accidental, label: 'Sharps' },
              { value: 'flat' as Accidental, label: 'Flats' },
            ]}
            onChange={(v) => updateSettings({ accidental: v })}
          />
        </div>
        <SwitchRow
          label="Advance automatically"
          hint="Jump to the next question a couple of seconds after a correct answer. Off by default, so the answer stays up until you tap Next."
          on={settings.autoAdvance}
          onChange={(v) => updateSettings({ autoAdvance: v })}
        />
      </section>

      <section className="card stack stack--tight">
        <span className="eyebrow">Practice history</span>
        <p className="small muted">
          {storageOk
            ? 'Kept on this device only. No account, nothing sent anywhere.'
            : 'This browser is blocking local storage, so history will not survive a reload. Private browsing is the usual cause.'}
        </p>
        <div className="row row--wrap" style={{ gap: '0.5rem' }}>
          <Button size="sm" onClick={download}>
            Export
          </Button>
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            Import
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = '';
            }}
          />
          {confirmReset ? (
            <>
              <Button
                size="sm"
                onClick={() => {
                  resetProfile();
                  setConfirmReset(false);
                  setMessage('History cleared.');
                }}
                style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
              >
                Erase everything
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
              Reset
            </Button>
          )}
        </div>
        {message && <p className="small faint">{message}</p>}
      </section>

      <p className="small faint" style={{ textAlign: 'center' }}>
        Ears — ear training for jazz musicians. Everything runs locally in the browser.
      </p>
    </div>
  );
}
