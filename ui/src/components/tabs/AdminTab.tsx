import { useState } from 'react';
import { Tabs } from '@connor-adams/designsystem';
import CommandRunner from './admin/CommandRunner';
import GrokVoiceSettings from './admin/GrokVoiceSettings';
import PersonaManager from './admin/PersonaManager';
import YoutubeIngestSettings from './admin/YoutubeIngestSettings';
import SoundLibraryMaintenance from './admin/SoundLibraryMaintenance';
import BotOperations from './admin/BotOperations';

type AdminSection = 'playback' | 'grok' | 'personas' | 'youtube' | 'sounds' | 'bot';

const SECTION_ITEMS: { value: AdminSection; label: string }[] = [
  { value: 'playback', label: 'Playback' },
  { value: 'grok', label: 'Grok' },
  { value: 'personas', label: 'Personas' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'sounds', label: 'Sounds' },
  { value: 'bot', label: 'Bot' },
];

const SECTIONS = {
  playback: CommandRunner,
  grok: GrokVoiceSettings,
  personas: PersonaManager,
  youtube: YoutubeIngestSettings,
  sounds: SoundLibraryMaintenance,
  bot: BotOperations,
};

export default function AdminTab() {
  const [section, setSection] = useState<AdminSection>('playback');
  const Section = SECTIONS[section];

  return (
    <section className="panel bg-surface rounded-2xl border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Admin Tasks</h2>
          <p className="text-sm text-text-secondary">
            Maintenance actions that affect shared storage.
          </p>
        </div>
      </div>

      {/* overflow="scroll" replaces the overflow-x-auto + no-scrollbar wrapper this
          used to need: Tabs owns the scroll and pulls the selected pill into view. */}
      <div className="mb-4">
        <Tabs
          items={SECTION_ITEMS}
          value={section}
          onValueChange={(value) => setSection(value as AdminSection)}
          overflow="scroll"
        />
      </div>

      <div className="space-y-4">
        <Section />
      </div>
    </section>
  );
}
