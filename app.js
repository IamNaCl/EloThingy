import 'dotenv/config';
import express from 'express';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction id, type and data
  const { id, type, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

        // "win" command
    if (name === 'win') {
      try {
        console.log('Win command received');

        // Extract the two parameters from the command
        const winnerName = data.options.find(option => option.name === 'winner')?.value;
        const loserName = data.options.find(option => option.name === 'loser')?.value;

        console.log(`Parameters received - Winner: "${winnerName}", Loser: "${loserName}"`);

        // Validate that winner and loser are different
        if (winnerName === loserName) {
          console.log('Error: Winner and loser are the same player');
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: `Error: Winner and loser cannot be the same player`
                }
              ]
            },
          });
        }

        const baseApiUrl = process.env.BASE_API_URL;
        console.log(`Using API base URL: ${baseApiUrl}`);

        // Step 1: Get JWT token
        console.log('Attempting to authenticate with API');

        const loginResponse = await fetch(`${baseApiUrl}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: process.env.API_USERNAME,
            password: process.env.API_PASSWORD,
          }),
        });

        console.log(`Login response status: ${loginResponse.status}`);

        if (!loginResponse.ok) {
          const errorText = await loginResponse.text();
          console.log(`Login failed with error: ${errorText}`);
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: `Error: Failed to authenticate with API`
                }
              ]
            },
          });
        }

        const loginData = await loginResponse.json();
        const token = loginData.token;
        console.log(`Authentication successful, token received: ${token ? 'Yes' : 'No'}`);

        // Step 2: Get list of players
        console.log('Fetching players list');

        const playersResponse = await fetch(`${baseApiUrl}/players`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        console.log(`Players response status: ${playersResponse.status}`);

        if (!playersResponse.ok) {
          const errorText = await playersResponse.text();
          console.log(`Failed to fetch players with error: ${errorText}`);
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: `Error: Failed to fetch players from API`
                }
              ]
            },
          });
        }

        const players = await playersResponse.json();
        console.log(`Players fetched successfully. Count: ${players.length}`);

        const winner = players.find(player => player.name === winnerName);
        const loser = players.find(player => player.name === loserName);

        console.log(`Winner found: ${winner ? `Yes (ID: ${winner.id})` : 'No'}`);
        console.log(`Loser found: ${loser ? `Yes (ID: ${loser.id})` : 'No'}`);

        // Step 4: Validate players exist
        if (!winner) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: `Error: Player "${winnerName}" not found`
                }
              ]
            },
          });
        }

        if (!loser) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: `Error: Player "${loserName}" not found`
                }
              ]
            },
          });
        }

        // Step 5: Send POST request to /matches
        console.log('Recording match');

        const matchResponse = await fetch(`${baseApiUrl}/matches`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            playerAId: winner.id,
            playerBId: loser.id,
            winnerId: winner.id,
          }),
        });

        console.log(`Match response status: ${matchResponse.status}`);

        if (!matchResponse.ok) {
          const errorText = await matchResponse.text();
          console.log(`Failed to record match with error: ${errorText}`);
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: `Error: Failed to record match`
                }
              ]
            },
          });
        }

        const matchData = await matchResponse.json();

        // Success response
        console.log('Sending OK response to Discord');
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `Er diaburu, ${winnerName} (${matchData.winnerCurrentElo}) farmeó a ${loserName} (${matchData.loserCurrentElo}) (+${matchData.eloChange})`
              }
            ]
          },
        });

      } catch (error) {
        console.error('Win command error:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `Error: An unexpected error occurred`
              }
            ]
          },
        });
      }
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
