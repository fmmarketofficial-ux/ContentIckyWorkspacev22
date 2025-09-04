const { google } = require('googleapis');

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const SPREADSHEET_ID = process.env.spreadsheetId;

const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function verifyAuthCode(code, userId) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "AUTH_CODES!A:E",
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0)
            return { success: false, message: "No hay códigos configurados." };
        const rowIndex = rows.findIndex((row) => row[0] === code);
        if (rowIndex === -1)
            return {
                success: false,
                message: "El código introducido no es válido.",
            };
        const row = rows[rowIndex];
        const status = row[2];
        const expirationDate = new Date(row[1]);
        if (status !== "activo")
            return {
                success: false,
                message: "Este código ya ha sido usado o no está activo.",
            };
        if (expirationDate < new Date()) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `AUTH_CODES!C${rowIndex + 1}`,
                valueInputOption: "USER_ENTERED",
                resource: { values: [["expirado"]] },
            });
            return { success: false, message: "Este código ha expirado." };
        }
        const today = new Date().toISOString().slice(0, 10);
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `AUTH_CODES!C${rowIndex + 1}:E${rowIndex + 1}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [["usado", userId, today]] },
        });
        return { success: true, message: "¡Código verificado con éxito!" };
    } catch (error) {
        console.error("Error en verifyAuthCode:", error);
        return {
            success: false,
            message: "Hubo un error al contactar con la base de datos.",
        };
    }
}

async function getAvailableAccount(sheetName, user, serverFilter = null) {
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.spreadsheetId, range: `${sheetName}!A2:F` });
        const rows = response.data.values;
        if (!rows || rows.length === 0) return null;

        let availableRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            // Comprobación extra para saltar filas malformadas o completamente vacías
            if (!row || !row[2] || row[2].trim() === '') continue;

            const isUsed = String(row[0]).toUpperCase() === 'TRUE' || String(row[1]).toUpperCase() === 'TRUE';
            if (!isUsed) {
                if (serverFilter) {
                    const bans = (row[4] || "").toLowerCase();
                    if (!bans.includes(serverFilter.toLowerCase())) { availableRowIndex = i; break; }
                } else { availableRowIndex = i; break; }
            }
        }

        if (availableRowIndex === -1) return null;

        const sheetRowNumber = availableRowIndex + 2;
        const rawEmail = rows[availableRowIndex][2];
        const rawPasswordData = rows[availableRowIndex][3];
        const rawBans = rows[availableRowIndex][4] || 'Sin baneos registrados';

        let accountData = { email: rawEmail, pass: rawPasswordData, bans: rawBans, twoFactorToken: null };

        if (sheetName === 'Discord' && rawPasswordData.includes('|')) {
            const parts = rawPasswordData.split('|');
            const passPart = parts.find(p => p.toLowerCase().includes('password:'));
            const tokenPart = parts.find(p => p.toLowerCase().includes('2fa token:'));
            if (passPart) { accountData.pass = passPart.replace(/password:/i, '').trim(); }
            if (tokenPart) { accountData.twoFactorToken = tokenPart.replace(/2fa token:/i, '').trim(); }
        }

        const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
        const statusMessage = `✅ Usada por ${user.tag} (${user.id}) el ${timestamp}`;

        await sheets.spreadsheets.values.update({ spreadsheetId: process.env.spreadsheetId, range: `${sheetName}!A${sheetRowNumber}`, valueInputOption: 'USER_ENTERED', resource: { values: [['TRUE']] } });
        await sheets.spreadsheets.values.update({ spreadsheetId: process.env.spreadsheetId, range: `${sheetName}!F${sheetRowNumber}`, valueInputOption: 'USER_ENTERED', resource: { values: [[statusMessage]] } });

        return accountData;
    } catch (error) { console.error(`Error obteniendo cuenta de ${sheetName}:`, error); return null; }
}

async function addBanByEmail(email, serverName) {
    const accountSheets = ["FiveM", "Discord", "Steam"];
    try {
        for (const sheetName of accountSheets) {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: process.env.spreadsheetId,
                range: `${sheetName}!C2:E`,
            });
            const rows = response.data.values;
            if (!rows) continue;
            const rowIndex = rows.findIndex(
                (row) => row[0] && row[0].toLowerCase() === email.toLowerCase(),
            );
            if (rowIndex !== -1) {
                const sheetRowNumber = rowIndex + 2;
                const currentBans = rows[rowIndex][2] || "";
                if (
                    currentBans.toLowerCase().includes(serverName.toLowerCase())
                ) {
                    return {
                        success: false,
                        message: `El ban en "${serverName}" ya estaba registrado.`,
                    };
                }
                const newBans = currentBans
                    ? `${currentBans}, ${serverName}`
                    : serverName;
                await sheets.spreadsheets.values.update({
                    spreadsheetId: process.env.spreadsheetId,
                    range: `${sheetName}!E${sheetRowNumber}`,
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [[newBans]] },
                });
                return {
                    success: true,
                    message: `✅ Ban en "${serverName}" añadido a la cuenta ${email}.`,
                };
            }
        }
        return {
            success: false,
            message: `❌ No se encontró ninguna cuenta con el email ${email}.`,
        };
    } catch (error) {
        console.error("Error añadiendo ban:", error);
        return {
            success: false,
            message: "Hubo un error de comunicación con la base de datos.",
        };
    }
}

async function addMultipleAccounts(sheetName, accountsString) {
    try {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.spreadsheetId, range: `${sheetName}!C2:C`, });
        const existingEmails = new Set((response.data.values || []).flat().map(e => e.toLowerCase()));
        const lines = accountsString.split('\n').filter(line => line.trim() !== "");
        const newRows = [];
        const duplicates = [];

        if (sheetName === 'Discord') {
            lines.forEach(line => {
                const emailMatch = line.match(/E-Mail:\s*([^|]+)/i);
                const passwordMatch = line.match(/Password:\s*([^|]+)/i);
                const tokenMatch = line.match(/2FA Token:\s*([^|]+)/i);

                if (emailMatch && passwordMatch && tokenMatch) {
                    const email = emailMatch[1].trim();
                    if (email && !existingEmails.has(email.toLowerCase())) {
                        const password = passwordMatch[1].trim();
                        const twoFactorToken = tokenMatch[1].trim();
                        const passwordColumnValue = `Password: ${password} | 2FA Token: ${twoFactorToken}`;
                        newRows.push([false, false, email, passwordColumnValue, "", ""]);
                        existingEmails.add(email.toLowerCase());
                    } else if (email) { duplicates.push(email); }
                }
            });
        } else {
            lines.forEach(line => {
                const parts = line.split(/[:|;]/);
                if (parts.length >= 2) {
                    const email = parts[0].trim();
                    if (email && !existingEmails.has(email.toLowerCase())) {
                        const password = parts[1].trim();
                        newRows.push([false, false, email, password, "", ""]);
                        existingEmails.add(email.toLowerCase());
                    } else if (email) { duplicates.push(email); }
                }
            });
        }

        if (newRows.length > 0) {
            await sheets.spreadsheets.values.append({ spreadsheetId: process.env.spreadsheetId, range: `${sheetName}!A:F`, valueInputOption: 'USER_ENTERED', resource: { values: newRows } });
        }
        return { added: newRows.length, duplicates: duplicates.length, duplicateList: duplicates };
    } catch (error) { console.error("Error en addMultipleAccounts:", error); return { error: true, message: "No se pudo conectar con Google Sheets." }; }
}

async function getDashboardStats() {
    const stats = {
        fivem: {
            total: 0,
            used: 0,
            available: 0,
            fullyAvailable: 0,
            bannedOn: new Map(),
        },
        discord: {
            total: 0,
            used: 0,
            available: 0,
            fullyAvailable: 0,
            bannedOn: new Map(),
        },
        steam: {
            total: 0,
            used: 0,
            available: 0,
            fullyAvailable: 0,
            bannedOn: new Map(),
        },
    };
    try {
        const sheetNames = ["FiveM", "Discord", "Steam"];
        for (const sheetName of sheetNames) {
            const key = sheetName.toLowerCase();
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A2:E`,
            });
            const rawRows = response.data.values || [];
            const rows = rawRows.filter(
                (row) =>
                    row && typeof row[2] === "string" && row[2].trim() !== "",
            );
            if (rows.length === 0) {
                continue;
            }
            stats[key].total = rows.length;
            rows.forEach((row) => {
                const isUsed =
                    String(row[0]).toUpperCase() === "TRUE" ||
                    String(row[1]).toUpperCase() === "TRUE";
                const bans = (row[4] || "").trim();
                if (isUsed) {
                    stats[key].used++;
                } else {
                    stats[key].available++;
                    if (!bans) {
                        stats[key].fullyAvailable++;
                    } else {
                        const bannedServers = bans
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                        bannedServers.forEach((server) => {
                            stats[key].bannedOn.set(
                                server,
                                (stats[key].bannedOn.get(server) || 0) + 1,
                            );
                        });
                    }
                }
            });
        }
        return stats;
    } catch (error) {
        console.error("Error al obtener estadísticas detalladas:", error);
        return null;
    }
}

async function getServerBanStats(serverName) {
    const results = {};
    const accountSheets = ["FiveM", "Discord", "Steam"];
    try {
        for (const sheetName of accountSheets) {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A2:E`,
            });
            const rows = response.data.values || [];
            if (rows.length === 0) {
                results[sheetName] = { total: 0, available: 0 };
                continue;
            }
            let bannedTotal = 0;
            let bannedAvailable = 0;
            rows.forEach((row) => {
                const isUsed =
                    String(row[0]).toUpperCase() === "TRUE" ||
                    String(row[1]).toUpperCase() === "TRUE";
                const bans = (row[4] || "").toLowerCase();
                if (bans.includes(serverName.toLowerCase())) {
                    bannedTotal++;
                    if (!isUsed) {
                        bannedAvailable++;
                    }
                }
            });
            results[sheetName] = {
                total: bannedTotal,
                available: bannedAvailable,
            };
        }
        return { success: true, stats: results };
    } catch (error) {
        console.error("Error en getServerBanStats:", error);
        return {
            success: false,
            message: "Error al contactar con la hoja de cálculo.",
        };
    }
}

async function releaseAccountByEmail(email) {
    const accountSheets = ["FiveM", "Discord", "Steam"];
    try {
        for (const sheetName of accountSheets) {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A2:F`,
            });
            const rows = response.data.values || [];
            if (!rows) continue;
            const rowIndex = rows.findIndex(
                (row) => row[2] && row[2].toLowerCase() === email.toLowerCase(),
            );
            if (rowIndex !== -1) {
                const sheetRowNumber = rowIndex + 2;
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!A${sheetRowNumber}`,
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [["FALSE"]] },
                });
                await sheets.spreadsheets.values.clear({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!F${sheetRowNumber}`,
                });
                return {
                    success: true,
                    message: `✅ La cuenta ${email} ha sido marcada como disponible.`,
                };
            }
        }
        return {
            success: false,
            message: `❌ No se encontró ninguna cuenta con el email ${email}.`,
        };
    } catch (error) {
        console.error("Error en releaseAccountByEmail:", error);
        return {
            success: false,
            message: "Error al contactar con la hoja de cálculo.",
        };
    }
}

module.exports = {
    verifyAuthCode,
    getAvailableAccount,
    addBanByEmail,
    getDashboardStats,
    addMultipleAccounts,
    getServerBanStats,
    releaseAccountByEmail,
};
