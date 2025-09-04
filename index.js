const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits } = require("discord.js");
const { createOrUpdatePanel } = require('./util/panelManager.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Cargar Comandos
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

// Cargar Eventos
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

// Actualizador de Estadísticas del Panel
client.on("ready", () => {
    setInterval(() => {
        const channelId = process.env.PANEL_CHANNEL_ID;
        const messageId = process.env.PANEL_MESSAGE_ID;
        if (channelId && messageId) {
            createOrUpdatePanel(client, channelId, messageId);
        }
    }, 60000); // Cada 5 minutos
});

client.login(process.env.DISCORD_BOT_TOKEN);

// Servidor Web para Keep-Alive 24/7 en Replit
const express = require("express");
const app = express();
app.get("/", (req, res) => res.send("Bot privado funcionando."));
app.listen(3000, () => console.log("✅ Servidor keep-alive iniciado."));
