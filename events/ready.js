const { Events } = require("discord.js");
module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`✅ Bot Privado listo! Conectado como ${client.user.tag}`);
    },
};
