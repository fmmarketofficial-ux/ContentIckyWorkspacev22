const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.spreadsheetId;
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

async function getAvailableAccount(sheetName, user, serverFilter = null) {
    const isDiscord = sheetName === "Discord";
    const range = isDiscord ? `${sheetName}!A2:F` : `${sheetName}!A2:E`;
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range,
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) return null;

        let availableRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || typeof row[1] !== "string" || row[1].trim() === "")
                continue;

            const isUsed = String(row[0]).toUpperCase() === "TRUE";
            if (!isUsed) {
                const bans = (
                    isDiscord ? row[4] || "" : row[3] || ""
                ).toLowerCase();
                if (serverFilter) {
                    if (!bans.includes(serverFilter.toLowerCase())) {
                        availableRowIndex = i;
                        break;
                    }
                } else {
                    availableRowIndex = i;
                    break;
                }
            }
        }

        if (availableRowIndex === -1) return null;

        const sheetRowNumber = availableRowIndex + 2;
        const rowData = rows[availableRowIndex];
        const accountData = isDiscord
            ? {
                  email: rowData[1],
                  pass: rowData[2],
                  twoFactorToken: rowData[3],
                  bans: rowData[4] || "Sin baneos",
              }
            : {
                  email: rowData[1],
                  pass: rowData[2],
                  bans: rowData[3] || "Sin baneos",
                  twoFactorToken: null,
              };

        const timestamp = new Date().toLocaleString("es-ES", {
            timeZone: "Europe/Madrid",
        });
        const statusColumn = isDiscord ? "F" : "E";
        const statusMessage = `✅ Usada por ${user.tag} (${user.id}) el ${timestamp}`;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A${sheetRowNumber}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [["TRUE"]] },
        });
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!${statusColumn}${sheetRowNumber}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [[statusMessage]] },
        });

        return accountData;
    } catch (error) {
        console.error(`Error en getAvailableAccount para ${sheetName}:`, error);
        return null;
    }
}

// /util/sheets.js (reemplaza esta función)
async function addMultipleAccounts(sheetName, accountsString) {
    try {
        const isDiscord = sheetName === "Discord";
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.spreadsheetId,
            range: `${sheetName}!B:B`,
        });
        const allValues = response.data.values || [];
        const existingEmails = new Set(
            allValues.flat().map((e) => (e ? e.toLowerCase() : "")),
        );

        let firstEmptyRow =
            allValues.findIndex((row) => !row[0] || row[0].trim() === "") + 2;
        if (firstEmptyRow === 1) firstEmptyRow = allValues.length + 2;

        const lines = accountsString
            .split("\n")
            .filter((line) => line.trim() !== "");
        const newRowsData = [];
        const duplicates = [];

        lines.forEach((line) => {
            const email = isDiscord
                ? (line.match(/E-Mail:\s*([^|]+)/i) || [])[1]
                : line.split(/[:|;]/)[0] || null;
            if (
                email &&
                email.trim() &&
                !existingEmails.has(email.trim().toLowerCase())
            ) {
                if (isDiscord) {
                    const passMatch = line.match(/Password:\s*([^|]+)/i);
                    const tokenMatch = line.match(/2FA Token:\s*([^|]+)/i);
                    if (passMatch && tokenMatch) {
                        newRowsData.push([
                            false,
                            email.trim(),
                            passMatch[1].trim(),
                            tokenMatch[1].trim(),
                            "",
                            "",
                        ]);
                    }
                } else {
                    const parts = line.split(/[:|;]/);
                    if (parts.length >= 2)
                        newRowsData.push([
                            false,
                            parts[0].trim(),
                            parts[1].trim(),
                            "",
                            "",
                        ]);
                }
                existingEmails.add(email.trim().toLowerCase());
            } else if (email) {
                duplicates.push(email.trim());
            }
        });

        if (newRowsData.length > 0) {
            const range = `${sheetName}!A${firstEmptyRow}`;
            await sheets.spreadsheets.values.update({
                spreadsheetId: process.env.spreadsheetId,
                range,
                valueInputOption: "USER_ENTERED",
                resource: { values: newRowsData },
            });
        }
        return { added: newRowsData.length, duplicates: duplicates.length };
    } catch (error) {
        console.error("Error en addMultipleAccounts:", error);
        return {
            error: true,
            message: "No se pudo conectar con Google Sheets.",
        };
    }
}

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

async function addBanByEmail(email, serverName) {
    const accountSheets = ["FiveM", "Discord", "Steam"];
    try {
        for (const sheetName of accountSheets) {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!B2:E`,
            });
            const rows = response.data.values;
            if (!rows) continue;
            const rowIndex = rows.findIndex(
                (row) => row[0] && row[0].toLowerCase() === email.toLowerCase(),
            );
            if (rowIndex !== -1) {
                const sheetRowNumber = rowIndex + 2;
                const isDiscord = sheetName === "Discord";
                const bansColumnIndex = isDiscord ? 3 : 2;
                const bansColumn = isDiscord ? "E" : "D";
                const currentBans = rows[rowIndex][bansColumnIndex] || "";
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
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!${bansColumn}${sheetRowNumber}`,
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
            const isDiscord = sheetName === "Discord";
            const range = isDiscord ? `${sheetName}!A2:F` : `${sheetName}!A2:E`;
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range,
            });
            const rawRows = response.data.values || [];
            const rows = rawRows.filter(
                (row) =>
                    row && typeof row[1] === "string" && row[1].trim() !== "",
            );
            if (rows.length === 0) {
                continue;
            }
            stats[key].total = rows.length;
            rows.forEach((row) => {
                const isUsed = String(row[0]).toUpperCase() === "TRUE";
                const bans = (isDiscord ? row[4] || "" : row[3] || "").trim();
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
            const isDiscord = sheetName === "Discord";
            const range = isDiscord ? `${sheetName}!A2:F` : `${sheetName}!A2:E`;
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range,
            });
            const rows = response.data.values || [];
            if (rows.length === 0) {
                results[sheetName] = { total: 0, available: 0 };
                continue;
            }
            let bannedTotal = 0;
            let bannedAvailable = 0;
            rows.forEach((row) => {
                const isUsed = String(row[0]).toUpperCase() === "TRUE";
                const bans = (
                    isDiscord ? row[4] || "" : row[3] || ""
                ).toLowerCase();
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
            const isDiscord = sheetName === "Discord";
            const range = isDiscord ? `${sheetName}!A2:F` : `${sheetName}!A2:E`;
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range,
            });
            const rows = response.data.values || [];
            if (!rows) continue;
            const rowIndex = rows.findIndex(
                (row) => row[1] && row[1].toLowerCase() === email.toLowerCase(),
            );
            if (rowIndex !== -1) {
                const sheetRowNumber = rowIndex + 2;
                const statusColumn = isDiscord ? "F" : "E";
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!A${sheetRowNumber}`,
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [["FALSE"]] },
                });
                await sheets.spreadsheets.values.clear({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!${statusColumn}${sheetRowNumber}`,
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

async function getAccountPack(user, serverFilter = null) {
    try {
        const categories = ["FiveM", "Discord", "Steam"];
        const pack = {};

        for (const category of categories) {
            const account = await getAvailableAccount(
                category,
                user,
                serverFilter,
            );
            if (!account) {
                // Si no se puede obtener alguna cuenta, liberar las que ya se obtuvieron
                for (const [cat, acc] of Object.entries(pack)) {
                    await releaseAccountByEmail(acc.email);
                }
                return {
                    success: false,
                    error: `No hay cuentas de ${category} disponibles${serverFilter ? ` que cumplan el filtro de "${serverFilter}"` : ""}.`,
                };
            }
            pack[category] = account;
        }

        return { success: true, pack };
    } catch (error) {
        console.error("Error en getAccountPack:", error);
        return {
            success: false,
            error: "Error interno al generar el pack. Revisa la consola.",
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
    getAccountPack,
};
