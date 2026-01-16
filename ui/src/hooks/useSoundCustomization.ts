import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { soundsApi } from '@/lib/api';

export interface SoundCustomization {
  displayName?: string;
  emoji?: string;
}

type Customizations = Record<string, SoundCustomization>;

export function useSoundCustomization() {
  const queryClient = useQueryClient();
  const { data: customizations = {} } = useQuery({
    queryKey: ['sound-customizations'],
    queryFn: () => soundsApi.listCustomizations().then((res) => res.data as Customizations),
  });

  const upsertMutation = useMutation({
    mutationFn: ({
      soundName,
      customization,
    }: {
      soundName: string;
      customization: SoundCustomization;
    }) => soundsApi.setCustomization(soundName, customization.displayName, customization.emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sound-customizations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (soundName: string) => soundsApi.deleteCustomization(soundName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sound-customizations'] });
    },
  });

  const updateCustomization = useCallback(
    (soundName: string, customization: SoundCustomization) => {
      upsertMutation.mutate({ soundName, customization });
    },
    [upsertMutation]
  );

  const deleteCustomization = useCallback(
    (soundName: string) => {
      deleteMutation.mutate(soundName);
    },
    [deleteMutation]
  );

  const getCustomization = useCallback(
    (soundName: string): SoundCustomization | undefined => {
      return customizations[soundName];
    },
    [customizations]
  );

  return {
    customizations,
    updateCustomization,
    deleteCustomization,
    getCustomization,
  };
}
