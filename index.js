const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits } = require("discord.js");

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

// Iniciar sesión en Discord
client.login(process.env.DISCORD_BOT_TOKEN);

// --- Servidor Web para Keep-Alive 24/7 ---
const express = require("express");
const app = express();
const port = 3000;

app.get("/", (req, res) => {
    res.send("El bot está funcionando correctamente.");
});

app.listen(port, () => {
    console.log(`✅ Servidor keep-alive escuchando en el puerto ${port}`);
});

const express = require("express");
const app = express();
const port = 3000;

app.get("/", (req, res) => {
    res.send("El bot está funcionando correctamente.");
});

app.listen(port, () => {
    console.log(`Servidor keep-alive escuchando en http://localhost:${port}`);
});
