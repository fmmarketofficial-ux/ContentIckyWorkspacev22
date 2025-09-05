const { google } = require("googleapis");

const SPREADSHEET_ID = process.env.spreadsheetId;
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// FUNCIÓN updateDiscordStatus con debug
async function updateDiscordStatus(rowNumber, statusMessage) {
    try {
        const range = `Discord!F${rowNumber}`;
        console.log(`🔍 updateDiscordStatus - Escribiendo en: ${range}`);
        console.log(`🔍 updateDiscordStatus - Mensaje: ${statusMessage}`);

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: "USER_ENTERED",
            resource: { values: [[statusMessage]] },
        });

        console.log(
            `✅ updateDiscordStatus - Estado escrito exitosamente en ${range}`,
        );
    } catch (error) {
        console.error(`❌ updateDiscordStatus - Error:`, error);
        throw error; // Re-lanzar el error para que se pueda detectar arriba
    }
}
// --- FIN DE LA SOLUCIÓN ---

async function getAvailableAccount(sheetName, user, serverFilter = null) {
    // ✅ SOLUCIÓN: Hacer la comparación case-insensitive
    const isDiscord = sheetName.toLowerCase() === "discord";
    const range = isDiscord ? `${sheetName}!A2:F` : `${sheetName}!A2:E`;
    const expectedCols = isDiscord ? 6 : 5;

    console.log(`🔍 DEBUG - Iniciando getAvailableAccount:`);
    console.log(`- sheetName: "${sheetName}"`);
    console.log(`- sheetName.toLowerCase(): "${sheetName.toLowerCase()}"`);
    console.log(`- isDiscord: ${isDiscord}`);
    console.log(`- range: ${range}`);

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range,
        });
        let rows = response.data.values || [];

        rows = rows.map((row) => {
            while (row.length < expectedCols) {
                row.push("");
            }
            return row;
        });

        let availableRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || typeof row[1] !== "string" || row[1].trim() === "")
                continue;
            const isUsed = String(row[0]).toUpperCase() === "TRUE";
            if (!isUsed) {
                const bans = (row[3] || "").toLowerCase();
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

        console.log(`🔍 DEBUG - Datos de la fila encontrada:`);
        console.log(`- sheetRowNumber: ${sheetRowNumber}`);
        console.log(`- rowData: [${rowData.join(", ")}]`);

        // IMPORTANTE: Extraer el 2FA token ANTES de sobrescribir nada
        const accountData = isDiscord
            ? {
                  email: rowData[1],
                  pass: rowData[2],
                  bans: rowData[3] || "Sin baneos",
                  twoFactorToken:
                      rowData[4] && rowData[4].trim() !== ""
                          ? rowData[4].trim()
                          : null,
              }
            : {
                  email: rowData[1],
                  pass: rowData[2],
                  bans: rowData[3] || "Sin baneos",
                  twoFactorToken: null,
              };

        console.log(`🔍 DEBUG - accountData creada:`);
        console.log(`- twoFactorToken: "${accountData.twoFactorToken}"`);
        console.log(`- tokenOriginal (rowData[4]): "${rowData[4]}"`);

        const timestamp = new Date().toLocaleString("es-ES", {
            timeZone: "Europe/Madrid",
        });
        const statusMessage = `✅ Usada por ${user.tag} (${user.id}) el ${timestamp}`;

        // Marcar cuenta como usada (Columna A)
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A${sheetRowNumber}`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [["TRUE"]] },
        });

        console.log(`🔍 DEBUG - Actualizando columna de estado:`);
        console.log(`- isDiscord: ${isDiscord}`);
        console.log(
            `- Comparación: "${sheetName.toLowerCase()}" === "discord" = ${sheetName.toLowerCase() === "discord"}`,
        );

        // Actualizar columna de estado
        if (isDiscord) {
            console.log(
                `✅ EJECUTANDO: updateDiscordStatus para fila ${sheetRowNumber}`,
            );
            // ✅ IMPORTANTE: Usar el nombre correcto de la hoja (con mayúscula) para la actualización
            await updateDiscordStatus(sheetRowNumber, statusMessage);
        } else {
            console.log(
                `⚠️ EJECUTANDO: Lógica para hoja no-Discord (${sheetName})`,
            );
            const statusColumn = "E";
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!${statusColumn}${sheetRowNumber}`,
                valueInputOption: "USER_ENTERED",
                resource: { values: [[statusMessage]] },
            });
        }

        return accountData;
    } catch (error) {
        console.error(`Error en getAvailableAccount para ${sheetName}:`, error);
        return null;
    }
}
// --- El resto de funciones no cambian ---
async function addMultipleAccounts(sheetName, accountsString) {
    try {
        const isDiscord = sheetName === "Discord";
        const emailColumn = "B";
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!${emailColumn}1:${emailColumn}`,
        });
        const allValues = response.data.values || [];
        const existingData = new Set(
            allValues.flat().map((e) => (e ? e.toLowerCase().trim() : "")),
        );
        let firstEmptyRow = -1;
        for (let i = 1; i < allValues.length; i++) {
            if (
                !allValues[i] ||
                !allValues[i][0] ||
                allValues[i][0].trim() === ""
            ) {
                firstEmptyRow = i + 1;
                break;
            }
        }
        if (firstEmptyRow === -1) {
            firstEmptyRow = allValues.length + 1;
        }
        const lines = accountsString
            .split("\n")
            .filter((line) => line.trim() !== "");
        const newRowsData = [];
        const duplicates = [];
        lines.forEach((line) => {
            if (isDiscord) {
                const emailMatch = line.match(/E-Mail:\s*([^|]+)/i);
                const passMatch = line.match(/Password:\s*([^|]+)/i);
                const tokenMatch = line.match(/2FA Token:\s*(\w+)/i);
                if (emailMatch && passMatch && tokenMatch) {
                    const email = emailMatch[1].trim();
                    if (email && !existingData.has(email.toLowerCase())) {
                        newRowsData.push([
                            false,
                            email,
                            passMatch[1].trim(),
                            "Ninguno",
                            tokenMatch[1].trim(),
                            "",
                        ]);
                        existingData.add(email.toLowerCase());
                    } else if (email) {
                        duplicates.push(email);
                    }
                }
            } else {
                const parts = line.split(/[:|;]/);
                if (parts.length >= 2) {
                    const userOrEmail = parts[0].trim();
                    if (
                        userOrEmail &&
                        !existingData.has(userOrEmail.toLowerCase())
                    ) {
                        newRowsData.push([
                            false,
                            userOrEmail,
                            parts[1].trim(),
                            "Ninguno",
                            "",
                        ]);
                        existingData.add(userOrEmail.toLowerCase());
                    } else if (userOrEmail) {
                        duplicates.push(userOrEmail);
                    }
                }
            }
        });
        if (newRowsData.length > 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A${firstEmptyRow}`,
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
async function addBanByEmail(email, serverName) {
    const accountSheets = ["FiveM", "Discord", "Steam"];
    try {
        for (const sheetName of accountSheets) {
            const bansColumn = "D";
            const range = `${sheetName}!B2:D`;
            const bansColumnIndex = 2;
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range,
            });
            const rows = response.data.values;
            if (!rows) continue;
            const rowIndex = rows.findIndex(
                (row) => row[0] && row[0].toLowerCase() === email.toLowerCase(),
            );
            if (rowIndex !== -1) {
                const sheetRowNumber = rowIndex + 2;
                const currentBans = rows[rowIndex][bansColumnIndex] || "";
                if (
                    currentBans.toLowerCase().includes(serverName.toLowerCase())
                ) {
                    return {
                        success: false,
                        message: `El ban en "${serverName}" ya estaba registrado.`,
                    };
                }
                const newBans =
                    currentBans && currentBans.toLowerCase() !== "ninguno"
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
            message: `❌ No se encontró la cuenta ${email}.`,
        };
    } catch (error) {
        console.error("Error añadiendo ban:", error);
        return {
            success: false,
            message: "Error de comunicación con la base de datos.",
        };
    }
}
async function releaseAccountByEmail(email) {
    const accountSheets = ["FiveM", "Discord", "Steam"];
    try {
        for (const sheetName of accountSheets) {
            const isDiscord = sheetName === "Discord";
            const statusColumn = isDiscord ? "F" : "E"; // ✅ CORRECTO - F para Discord, E para otros
            const range = `${sheetName}!B:B`;

            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range,
            });
            const values = response.data.values;
            if (!values) continue;

            const rowIndex = values.findIndex(
                (row) => row[0] && row[0].toLowerCase() === email.toLowerCase(),
            );

            if (rowIndex !== -1 && rowIndex > 0) {
                const sheetRowNumber = rowIndex + 1;

                // Marcar como no usada
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!A${sheetRowNumber}`,
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [["FALSE"]] },
                });

                // Limpiar la columna de estado (F para Discord, E para otros)
                await sheets.spreadsheets.values.clear({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!${statusColumn}${sheetRowNumber}`,
                });

                console.log(
                    `✅ Cuenta ${email} liberada. Estado limpiado en ${statusColumn}${sheetRowNumber}`,
                );

                return {
                    success: true,
                    message: `✅ La cuenta ${email} ha sido liberada.`,
                };
            }
        }
        return {
            success: false,
            message: `❌ No se encontró la cuenta ${email}.`,
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
        let acquiredAccounts = [];
        for (const category of categories) {
            const account = await getAvailableAccount(
                category,
                user,
                serverFilter,
            );
            if (!account) {
                for (const acc of acquiredAccounts) {
                    await releaseAccountByEmail(acc.email);
                }
                return {
                    success: false,
                    error: `No hay cuentas de ${category} disponibles${serverFilter ? ` que cumplan el filtro de "${serverFilter}"` : ""}.`,
                };
            }
            pack[category] = account;
            acquiredAccounts.push(account);
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
            const bansColumnIndex = 3;
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range,
            });
            const rawRows = response.data.values || [];
            const rows = rawRows.filter(
                (row) =>
                    row && typeof row[1] === "string" && row[1].trim() !== "",
            );
            if (rows.length === 0) continue;
            stats[key].total = rows.length;
            rows.forEach((row) => {
                const isUsed = String(row[0]).toUpperCase() === "TRUE";
                const bans = (row[bansColumnIndex] || "").trim();
                if (isUsed) {
                    stats[key].used++;
                } else {
                    stats[key].available++;
                    if (!bans || bans.toLowerCase() === "ninguno") {
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

/**
 * Obtiene los datos crudos de una fila específica para depuración
 * @param {string} sheetName - Nombre de la hoja
 * @param {number} rowNumber - Número de fila (empezando desde 1)
 * @returns {Promise<{success: boolean, data: any[], message?: string}>}
 */
async function getRawRowData(sheetName, rowNumber) {
    try {
        const range = `${sheetName}!${rowNumber}:${rowNumber}`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return {
                success: false,
                data: [],
                message: `La fila ${rowNumber} está vacía o no existe.`,
            };
        }

        return {
            success: true,
            data: rows[0] || [],
            message: `Datos obtenidos exitosamente de la fila ${rowNumber}.`,
        };
    } catch (error) {
        console.error(`Error obteniendo datos de la fila ${rowNumber}:`, error);
        return {
            success: false,
            data: [],
            message: `Error al acceder a la fila ${rowNumber}: ${error.message}`,
        };
    }
}

module.exports = {
    verifyAuthCode,
    getAvailableAccount,
    addBanByEmail,
    getDashboardStats,
    addMultipleAccounts,
    releaseAccountByEmail,
    getAccountPack,
    updateDiscordStatus,
    getRawRowData, // ✅ AÑADIR ESTA LÍNEA
};
