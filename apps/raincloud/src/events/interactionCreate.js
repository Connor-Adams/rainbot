const { Events, MessageFlags } = require('discord.js');
const { createLogger } = require('@rainbot/utils/logger');
// listSounds lives in storage, not voiceManager. voiceManager exports no such
// function, so the previous call threw a TypeError on every keystroke and the
// catch below answered with an empty choice list.
const { listSounds } = require('@rainbot/utils/storage');
const stats = require('@rainbot/utils/statistics');
const { searchSounds } = require('@rainbot/utils');

const log = createLogger('INTERACTION');

/**
 * Answers autocomplete for /play's `source` option.
 *
 * Exported so the branch can be exercised without a Discord client; `execute`
 * remains its only production caller.
 */
async function handlePlaySourceAutocomplete(interaction, startTime) {
  try {
    const sounds = await listSounds();
    const input = interaction.options.getFocused(true).value.trim();

    // Semantic search is off here on purpose: autocomplete fires on
    // every keystroke against Discord's 3 second budget, and an
    // embedding round-trip per keystroke would blow both the latency
    // and the API bill. The dashboard, which debounces, keeps it.
    const results = await searchSounds({
      query: input,
      sounds: sounds.map((sound) => ({ name: sound.name })),
      limit: 25,
      allowSemantic: false,
    });

    const choices = results.slice(0, 25).map((result) => {
      const label = result.snippet ? `${result.name} — ${result.snippet}` : result.name;
      return {
        name: label.length > 100 ? `${label.substring(0, 97)}...` : label,
        value: result.name,
      };
    });

    await interaction.respond(choices);

    // Track autocomplete interaction
    stats.trackInteraction(
      'autocomplete',
      interaction.id,
      `play_source`,
      interaction.user.id,
      interaction.user.username,
      interaction.guildId,
      interaction.channelId,
      Date.now() - startTime,
      true,
      null,
      { query: input, resultsShown: choices.length, totalSounds: sounds.length }
    );
  } catch (error) {
    log.error(`Error in autocomplete: ${error.message}`);
    stats.trackInteraction(
      'autocomplete',
      interaction.id,
      `play_source`,
      interaction.user.id,
      interaction.user.username,
      interaction.guildId,
      interaction.channelId,
      Date.now() - startTime,
      false,
      error.message,
      null
    );
    // Return empty array on error - user can still type and search
    await interaction.respond([]);
  }
}

module.exports = {
  name: Events.InteractionCreate,
  handlePlaySourceAutocomplete,
  async execute(interaction) {
    const startTime = Date.now();

    // Handle autocomplete interactions
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        return;
      }

      // Handle autocomplete for /play command's source option
      if (interaction.commandName === 'play') {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'source') {
          await handlePlaySourceAutocomplete(interaction, startTime);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      log.warn(`No command matching: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
      log.debug(`Executed: ${interaction.commandName} by ${interaction.user.tag}`);

      const responseTime = Date.now() - startTime;

      // Track successful command execution (legacy table)
      stats.trackCommand(
        interaction.commandName,
        interaction.user.id,
        interaction.guildId,
        'discord',
        true,
        null,
        interaction.user.username,
        interaction.user.discriminator
      );

      // Track slash command interaction (new detailed table)
      stats.trackInteraction(
        'slash_command',
        interaction.id,
        interaction.commandName,
        interaction.user.id,
        interaction.user.username,
        interaction.guildId,
        interaction.channelId,
        responseTime,
        true,
        null,
        {
          options:
            interaction.options?.data?.map((o) => ({
              name: o.name,
              type: o.type,
              value: o.value,
            })) || [],
        }
      );
    } catch (error) {
      log.error(`Error executing ${interaction.commandName}: ${error.message}`, {
        stack: error.stack,
      });

      const responseTime = Date.now() - startTime;

      // Track failed command execution (legacy table)
      stats.trackCommand(
        interaction.commandName,
        interaction.user.id,
        interaction.guildId,
        'discord',
        false,
        error.message,
        interaction.user.username,
        interaction.user.discriminator
      );

      // Track slash command interaction (new detailed table)
      stats.trackInteraction(
        'slash_command',
        interaction.id,
        interaction.commandName,
        interaction.user.id,
        interaction.user.username,
        interaction.guildId,
        interaction.channelId,
        responseTime,
        false,
        error.message,
        {
          options:
            interaction.options?.data?.map((o) => ({
              name: o.name,
              type: o.type,
              value: o.value,
            })) || [],
        }
      );

      const reply = {
        content: 'There was an error while executing this command!',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
