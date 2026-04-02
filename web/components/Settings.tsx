"use client";

import { useState, useEffect } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "./ui/dialog";
import { Slider } from "./ui/slider";

export interface SettingsConfig {
  showSources: boolean;
  topK: number;
  temperature: number;
  maxTokens: number;
}

interface SettingsProps {
  settings: SettingsConfig;
  onSettingsChange: (settings: SettingsConfig) => void;
}

const DEFAULT_SETTINGS: SettingsConfig = {
  showSources: true,
  topK: 5,
  temperature: 0.7,
  maxTokens: 500,
};

export function Settings({ settings, onSettingsChange }: SettingsProps) {
  const [open, setOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    onSettingsChange(localSettings);
    setOpen(false);
  };

  const handleReset = () => {
    setLocalSettings(DEFAULT_SETTINGS);
  };

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="w-full justify-start gap-2 text-stone hover:text-charcoal hover:bg-cream text-xs uppercase tracking-wide font-normal"
      >
        <SettingsIcon className="h-4 w-4" />
        <span>Settings</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogClose onClick={() => setOpen(false)} />
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">
              Response Settings
            </DialogTitle>
            <DialogDescription>
              Adjust how the AI generates responses
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Show Sources */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-sm font-normal text-charcoal uppercase tracking-wide">
                  Show Sources
                </label>
                <p className="text-sm text-stone mt-1 font-light">
                  Display source references below responses
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.showSources}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      showSources: e.target.checked,
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-stone-border peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cream-dark rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-charcoal"></div>
              </label>
            </div>

            {/* Number of Sources */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-normal text-charcoal uppercase tracking-wide">
                  Number of Sources
                </label>
                <span className="text-sm font-normal text-charcoal">
                  {localSettings.topK}
                </span>
              </div>
              <Slider
                value={localSettings.topK}
                onValueChange={(value) =>
                  setLocalSettings({ ...localSettings, topK: value })
                }
                min={1}
                max={10}
                step={1}
              />
              <p className="text-sm text-stone mt-1 font-light">
                How many sources to retrieve and use in the answer
              </p>
            </div>

            {/* Temperature */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-normal text-charcoal uppercase tracking-wide">
                  Temperature
                </label>
                <span className="text-sm font-normal text-stone">
                  {localSettings.temperature.toFixed(1)}
                </span>
              </div>
              <Slider
                value={localSettings.temperature}
                onValueChange={(value) =>
                  setLocalSettings({ ...localSettings, temperature: value })
                }
                min={0}
                max={1}
                step={0.1}
                disabled
              />
              <p className="text-sm text-stone mt-1 font-light">
                Controls creativity (lower = more focused, higher = more
                creative) - Coming soon
              </p>
            </div>

            {/* Max Tokens */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-normal text-charcoal uppercase tracking-wide">
                  Max Response Length
                </label>
                <span className="text-sm font-normal text-stone">
                  {localSettings.maxTokens}
                </span>
              </div>
              <Slider
                value={localSettings.maxTokens}
                onValueChange={(value) =>
                  setLocalSettings({ ...localSettings, maxTokens: value })
                }
                min={100}
                max={1000}
                step={50}
                disabled
              />
              <p className="text-sm text-stone mt-1 font-light">
                Maximum length of generated responses - Coming soon
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleReset}
              className="border-2 border-charcoal text-charcoal hover:bg-cream hover:border-charcoal uppercase tracking-wide text-xs font-normal"
            >
              Reset
            </Button>
            <Button
              onClick={handleSave}
              className="bg-charcoal hover:bg-charcoal-light text-cream border-2 border-charcoal uppercase tracking-wide text-xs font-normal"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
