const fs = require("node:fs");
const path = require("node:path");
// Se añade 'GatewayIntentBits' para poder especificar los intents necesarios.
const { Client, Collection, GatewayIntentBits } = require("discord.js");
const { createOrUpdatePanel } = require("./util/panelManager.js");

// --- INICIO DE LA CORRECCIÓN ---
// Se añade 'GatewayIntentBits.DirectMessages' para que el bot pueda recibir
// mensajes en DMs, lo cual es necesario para el colector de archivos .txt.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages, // <-- INTENT AÑADIDO
    ],
});
// --- FIN DE LA CORRECCIÓN ---

client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
    }
}

const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith(".js"));
for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

client.on("ready", () => {
    setInterval(() => {
        const channelId = process.env.PANEL_CHANNEL_ID;
        const messageId = process.env.PANEL_MESSAGE_ID;
        if (channelId && messageId) {
            createOrUpdatePanel(client, channelId, messageId);
        }
    }, 60000); // 1 minuto
});

client.login(process.env.DISCORD_BOT_TOKEN);

const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Bot privado funcionando."));
app.listen(3000, () => console.log("✅ Servidor keep-alive iniciado."));
