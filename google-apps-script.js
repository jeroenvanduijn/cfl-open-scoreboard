// ============================================================
// CrossFit Leiden Open 2026 — Apps Script
//
// Tabs:
//   Deelnemers   — bronlijst (First Name, Last Name, T-shirt, Team, Regnr, Email, Geslacht)
//   Total Score  — totaalpunten per team (wordt door script bijgewerkt)
//   26.1         — submissions week 1
//   26.2         — submissions week 2
//   26.3         — submissions week 3
// ============================================================

const TEAMS = ["Poor Decisions Club", "Never Skip Jeff Day", "The Gladiators"];
const DIVISIONS = ["Foundations", "Scaled", "Rx"];
const GENDERS = ["Man", "Vrouw"];

const POINTS = {
    DEELNAME: 1,
    BEST_DRESSED: 2,
    TEAM_OUTFIT: 5,
    COMMUNITY_SPIRIT: 5,
};

// ⚠️ Pas aan als je naar week 2 of 3 gaat
const ACTIEVE_WEEK = "26.3";

// Kolom indices Deelnemers sheet (0-based)
// A=Voornaam, B=Achternaam, C=Tshirt, D=Team, E=Regnr, F=Email, G=Geslacht
const COL = {
    VOORNAAM: 0, ACHTERNAAM: 1, TSHIRT: 2, TEAM: 3,
    REGNR: 4, EMAIL: 5, GESLACHT: 6,
};

// SUB kolom indices worden dynamisch bepaald op basis van de header rij
// Zie: getKolomIndices(headerRij)
// Fallback vaste indices als header niet gevonden wordt:
const SUB_DEFAULT = {
    TIMESTAMP: 0, NAAM: 1, DIVISIE: 2, SCORE_TYPE: 3, SCORE: 4, TIEBREAK: 5,
    VOTE_OUTFIT: 6, VOTE_COMMUNITY: 7, JUDGE: 8, OPMERKINGEN: 9,
    VOTE_BESTDRESSED: 11,
};

// Bepaal kolomindices dynamisch op basis van header rij
function getKolomIndices(headerRij) {
    const idx = {};
    headerRij.forEach((cel, i) => {
        const h = String(cel || "").toLowerCase().trim();
        if (h.includes("timestamp")) idx.TIMESTAMP = i;
        else if (h.includes("athlete") || h.includes("naam")) idx.NAAM = i;
        else if (h.includes("division") || h === "divisie") idx.DIVISIE = i;
        else if (h.includes("score type") || h.includes("score_type")) idx.SCORE_TYPE = i;
        else if (h === "score") idx.SCORE = i;
        else if (h.includes("tiebreak")) idx.TIEBREAK = i;
        else if (h.includes("outfit")) idx.VOTE_OUTFIT = i;
        else if (h.includes("community")) idx.VOTE_COMMUNITY = i;
        else if (h.includes("best dressed") || h.includes("best_dressed")) idx.VOTE_BESTDRESSED = i;
        else if (h.includes("judge")) idx.JUDGE = i;
        else if (h.includes("note") || h.includes("opmerking")) idx.OPMERKINGEN = i;
    });
    // Fallback voor ontbrekende kolommen
    return Object.assign({}, SUB_DEFAULT, idx);
}

// ============================================================
// WEB APP — JSON endpoint voor de scoreboard website
// ============================================================
function doGet(e) {
    try {
        // Altijd herberekenen — berekening is snel genoeg en trigger quota is onbetrouwbaar
        const data = buildScoreboardData(true); // skipWrite — voorkomt sheet change events
        return ContentService
            .createTextOutput(JSON.stringify(data))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService
            .createTextOutput(JSON.stringify({ error: err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// Leest scores uit PropertiesService — raakt de sheet NIET aan
// PropertiesService is een key-value store die geen sheet events triggert
function leesScoreboardData() {
    const props = PropertiesService.getScriptProperties();

    let scores = {};
    let rankings = {};
    let totalRankings = {};
    let bijgewerkt = new Date().toISOString();

    try {
        const scoresRaw = props.getProperty("SCORES");
        if (scoresRaw) scores = JSON.parse(scoresRaw);
    } catch (e) { }

    try {
        const rankingsRaw = props.getProperty("RANKINGS");
        if (rankingsRaw) rankings = JSON.parse(rankingsRaw);
    } catch (e) { }

    try {
        const totalRankingsRaw = props.getProperty("TOTAL_RANKINGS");
        if (totalRankingsRaw) totalRankings = JSON.parse(totalRankingsRaw);
    } catch (e) { }

    try {
        bijgewerkt = props.getProperty("BIJGEWERKT") || bijgewerkt;
    } catch (e) { }

    return { scores, rankings, totalRankings, bijgewerkt, actieveWeek: ACTIEVE_WEEK };
}

// ============================================================
// SCOREBOARD DATA OPBOUWEN
// ============================================================
function buildScoreboardData(skipWrite = false) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const deelnemers = getDeelnemers(ss);
    const teamTotalen = initiTeamScores();

    ["26.1", "26.2", "26.3"].forEach(week => {
        const sheet = ss.getSheetByName(week);
        Logger.log(`Sheet "${week}": ${sheet ? `gevonden, ${sheet.getLastRow()} rijen` : "NIET GEVONDEN"}`);
        if (!sheet || sheet.getLastRow() < 2) return; // minimaal 1 header + 1 submission
        const weekScores = verwerkWeekSubmissions(sheet, deelnemers);
        TEAMS.forEach(team => {
            if (!weekScores[team]) return;
            teamTotalen[team].deelname += weekScores[team].deelname;
            teamTotalen[team].ranking += weekScores[team].ranking;
            teamTotalen[team].bestDressed += weekScores[team].bestDressed;
            teamTotalen[team].teamOutfit += weekScores[team].teamOutfit;
            teamTotalen[team].communitySpirit += weekScores[team].communitySpirit;
        });
    });

    TEAMS.forEach(team => {
        const t = teamTotalen[team];
        t.totaal = t.deelname + t.ranking + t.bestDressed + t.teamOutfit + t.communitySpirit;
        t.aantalDeelnemers = Object.values(deelnemers).filter(d => d.team === team).length;
    });

    // Bouw ook individuele rankings per week/divisie/geslacht
    const individueleRankings = {};
    ["26.1", "26.2", "26.3"].forEach(week => {
        const sheet = ss.getSheetByName(week);
        Logger.log(`Sheet "${week}": ${sheet ? `gevonden, ${sheet.getLastRow()} rijen` : "NIET GEVONDEN"}`);
        if (!sheet || sheet.getLastRow() < 2) return;
        individueleRankings[week] = buildIndividueleRankings(sheet, deelnemers);
    });

    // ── TOTAL RANKINGS: som van punten per divisie/geslacht over alle events ──
    const totalRankings = buildTotalRankings(individueleRankings);

    // Alleen schrijven als aanroep niet van doGet komt
    if (!skipWrite) {
        updateTotalScoreSheet(ss, teamTotalen);
    }

    // Sla scores op in PropertiesService — doGet() leest van hier zonder sheet aan te raken
    const props = PropertiesService.getScriptProperties();
    const bijgewerkt = new Date().toISOString();
    props.setProperties({
        "SCORES": JSON.stringify(teamTotalen),
        "RANKINGS": JSON.stringify(individueleRankings),
        "TOTAL_RANKINGS": JSON.stringify(totalRankings),
        "BIJGEWERKT": bijgewerkt,
    });

    return {
        scores: teamTotalen,
        rankings: individueleRankings,
        totalRankings,
        bijgewerkt,
        actieveWeek: ACTIEVE_WEEK,
    };
}

// ============================================================
// TOTAL RANKINGS — som van per-event punten per divisie/geslacht
//
// Per divisie/geslacht groep:
//   1. Verzamel alle atleten die in die groep hebben deelgenomen
//      in MINSTENS één event
//   2. Tel hun punten op over alle events
//   3. Sorteer op totaal (hoogste eerst)
//   4. Ken rang toe
//
// Atleten die van divisie wisselen verschijnen in meerdere
// divisie-rankings (met punten alleen uit de events waarin
// ze in die divisie meededen).
// ============================================================
function buildTotalRankings(individueleRankings) {
    const events = Object.keys(individueleRankings); // ["26.1", "26.2", ...]
    if (events.length === 0) return {};

    const result = {};

    DIVISIONS.forEach(div => {
        GENDERS.forEach(gen => {
            const key = `${div}_${gen}`;

            // Verzamel punten per atleet over alle events
            const atletenMap = {}; // naam -> { team, events: { "26.1": punten, ... }, totaal }

            events.forEach(week => {
                const groep = individueleRankings[week]?.[key];
                if (!groep || !groep.length) return;

                groep.forEach(a => {
                    if (!atletenMap[a.naam]) {
                        atletenMap[a.naam] = {
                            naam: a.naam,
                            team: a.team,
                            events: {},
                            totaal: 0,
                        };
                    }
                    atletenMap[a.naam].events[week] = {
                        punten: a.punten,
                        score: a.score,
                        scoreType: a.scoreType,
                        rang: a.rang,
                    };
                    atletenMap[a.naam].totaal += a.punten;
                });
            });

            const atleten = Object.values(atletenMap);
            if (!atleten.length) return;

            // Sorteer op totaal (hoogste eerst)
            atleten.sort((a, b) => b.totaal - a.totaal);

            // Ken rang toe
            result[key] = atleten.map((a, idx) => ({
                rang: idx + 1,
                naam: a.naam,
                team: a.team,
                events: a.events,
                totaal: a.totaal,
            }));
        });
    });

    return result;
}

// ============================================================
// INDIVIDUELE RANKINGS PER DIVISIE/GESLACHT
// Geeft per week een object terug met per groep een gesorteerde lijst
// van deelnemers met hun score, rang en verdiende punten
// ============================================================
function buildIndividueleRankings(sheet, deelnemers) {
    const data = sheet.getDataRange().getValues();

    let dataStartIdx = 1;
    let headerIdx = 0;
    for (let i = 0; i < Math.min(data.length, 5); i++) {
        if (String(data[i][1]).toLowerCase().includes("athlete") ||
            String(data[i][0]).toLowerCase().includes("timestamp")) {
            headerIdx = i;
            dataStartIdx = i + 1;
            break;
        }
    }
    const SUB = getKolomIndices(data[headerIdx]);

    const submissions = [];
    Logger.log(`buildIndividueleRankings: ${data.length} rijen, dataStartIdx=${dataStartIdx}`);
    for (let i = dataStartIdx; i < data.length; i++) {
        const r = data[i];
        Logger.log(`Rij ${i}: naam=${r[SUB.NAAM]}, timestamp=${r[SUB.TIMESTAMP]}, score=${r[SUB.SCORE]}`);
        // Skip lege rijen en rijen zonder timestamp (Google Forms voegt soms lege rijen toe)
        if (!r[SUB.NAAM] || !r[SUB.TIMESTAMP]) { Logger.log(`  -> Skip: geen naam of timestamp`); continue; }
        if (String(r[SUB.NAAM]).trim() === "") { Logger.log(`  -> Skip: lege naam`); continue; }

        const naam = String(r[SUB.NAAM]).replace(/\s+/g, " ").trim();
        const deelnemer = deelnemers[naam.toLowerCase()];
        if (!deelnemer) { Logger.log(`  -> Skip: '${naam}' niet gevonden in deelnemers`); continue; }

        const scoreType = String(r[SUB.SCORE_TYPE] || "reps").trim().toLowerCase();
        Logger.log(`  -> Verwerkt: naam=${naam}, team=${deelnemer.team}, geslacht=${deelnemer.geslacht}, scoreType=${scoreType}`);
        const rawScore = r[SUB.SCORE];
        const rawTiebreak = r[SUB.TIEBREAK];

        let vergelijkbareScore;
        // Check op "finished" of "tijd" — NIET alleen "time" want "reps — I hit the time cap" bevat ook "time"
        const isTime = scoreType.startsWith("time") || scoreType === "tijd";
        if (isTime) {
            vergelijkbareScore = parseSeconden(rawScore);
        } else {
            const reps = parseFloat(String(rawScore || 0).replace(",", ".")) || 0;
            const tiebreakSec = parseSeconden(rawTiebreak) || 99999;
            vergelijkbareScore = 100000 - reps + (tiebreakSec / 100000);
        }

        submissions.push({
            naam,
            team: deelnemer.team,
            geslacht: deelnemer.geslacht,
            divisie: String(r[SUB.DIVISIE] || "Scaled").trim(),
            scoreType: isTime ? "tijd" : "reps",
            rawScore: String(rawScore || ""),
            vergelijkbareScore: vergelijkbareScore !== null ? vergelijkbareScore : 999999,
        });
    }

    const result = {};

    DIVISIONS.forEach(div => {
        GENDERS.forEach(gen => {
            const groep = submissions.filter(s => s.divisie === div && s.geslacht === gen);
            if (!groep.length) return;

            groep.sort((a, b) => a.vergelijkbareScore - b.vergelijkbareScore);
            const maxPunten = groep.length;

            const key = `${div}_${gen}`;
            result[key] = groep.map((s, idx) => ({
                rang: idx + 1,
                naam: s.naam,
                team: s.team,
                score: s.rawScore,
                scoreType: s.scoreType,
                punten: maxPunten - idx,
            }));
        });
    });

    return result;
}

// ============================================================
// DEELNEMERS LEZEN
// ============================================================
function getDeelnemers(ss) {
    const data = ss.getSheetByName("Deelnemers").getDataRange().getValues();
    const deelnemers = {};
    Logger.log(`Deelnemers sheet: ${data.length - 1} rijen gevonden`);
    for (let i = 1; i < data.length; i++) {
        const r = data[i];
        const voornaam = String(r[COL.VOORNAAM] || "").trim();
        if (!voornaam) continue;
        const naam = `${voornaam} ${String(r[COL.ACHTERNAAM] || "").trim()}`.replace(/\s+/g, " ").trim();
        deelnemers[naam.toLowerCase()] = {
            naam,
            team: String(r[COL.TEAM] || "").trim(),
            geslacht: String(r[COL.GESLACHT] || "Onbekend").trim(),
        };
    }
    return deelnemers;
}

// ============================================================
// WEEK SUBMISSIONS VERWERKEN
//
// Score logica voor "for time" workouts met time cap (zoals 26.1):
//
// Het form vraagt:
//   - Score type: "tijd" (je haalde de cap) of "reps" (je haalde de cap niet)
//   - Score: tijd in mm:ss OF aantal reps
//   - Tiebreak: tijd in mm:ss (laatste set box overs, alleen bij reps-score)
//
// Ranking: finishers (tijd) altijd boven non-finishers (reps)
//   Binnen finishers: snelste tijd wint
//   Binnen non-finishers: meeste reps wint, bij gelijke reps snelste tiebreak
//
// We converteren alles naar één vergelijkbaar getal (lagere waarde = beter):
//   Finisher:    score = seconden (bijv. 10:35 = 635 sec)
//   Non-finisher: score = 100000 - reps (bijv. 300 reps = 99700)
//   -> Finisher (max 720 sec) altijd kleiner dan non-finisher (min 99646)
// ============================================================
function verwerkWeekSubmissions(sheet, deelnemers) {
    const data = sheet.getDataRange().getValues();
    const scores = initiTeamScores();
    const submissions = [];

    // Auto-detect header row — form sheets start at row 1, setup sheets at row 3
    let dataStartIdx = 1;
    let headerIdx = 0;
    for (let i = 0; i < Math.min(data.length, 5); i++) {
        if (String(data[i][1]).toLowerCase().includes("athlete") ||
            String(data[i][0]).toLowerCase().includes("timestamp")) {
            headerIdx = i;
            dataStartIdx = i + 1;
            break;
        }
    }
    const SUB = getKolomIndices(data[headerIdx]);
    Logger.log(`Kolom indices: NAAM=${SUB.NAAM}, DIVISIE=${SUB.DIVISIE}, SCORE_TYPE=${SUB.SCORE_TYPE}, SCORE=${SUB.SCORE}`);

    for (let i = dataStartIdx; i < data.length; i++) {
        const r = data[i];
        // Skip lege rijen en rijen zonder timestamp (Google Forms voegt soms lege rijen toe)
        if (!r[SUB.NAAM] || !r[SUB.TIMESTAMP]) continue;
        if (String(r[SUB.NAAM]).trim() === "") continue;

        const naam = String(r[SUB.NAAM]).replace(/\s+/g, " ").trim();
        const deelnemer = deelnemers[naam.toLowerCase()];
        if (!deelnemer) {
            Logger.log(`⚠️ Niet gevonden: "${naam}"`);
            continue;
        }

        const scoreType = String(r[SUB.SCORE_TYPE] || "reps").trim().toLowerCase();
        const rawScore = r[SUB.SCORE];
        const rawTiebreak = r[SUB.TIEBREAK];

        // Bereken vergelijkbare score (lager = beter)
        let vergelijkbareScore;
        if (scoreType === "tijd") {
            // Finisher: score in seconden
            vergelijkbareScore = parseSeconden(rawScore);
        } else {
            // Non-finisher: 100000 - reps (lagere waarde = meer reps = beter)
            const reps = parseFloat(String(rawScore || 0).replace(",", ".")) || 0;
            const tiebreakSec = parseSeconden(rawTiebreak) || 99999;
            // Bij gelijke reps: snellere tiebreak wint -> encode als reps + fractie van tiebreak
            vergelijkbareScore = 100000 - reps + (tiebreakSec / 100000);
        }

        submissions.push({
            naam,
            vergelijkbareScore: vergelijkbareScore !== null ? vergelijkbareScore : 999999,
            team: deelnemer.team,
            geslacht: deelnemer.geslacht,
            divisie: String(r[SUB.DIVISIE] || "Scaled").trim(),
            voteOutfit: String(r[SUB.VOTE_OUTFIT] || "").trim(),
            voteCommunity: String(r[SUB.VOTE_COMMUNITY] || "").split(",").map(s => s.trim()).filter(Boolean),
            voteBestDressed: String(r[SUB.VOTE_BESTDRESSED] || "").trim().toLowerCase(),
        });
    }

    Logger.log(`Week submissions gevonden: ${submissions.length}`);
    if (!submissions.length) {
        Logger.log("Geen submissions — check of de sheet naam klopt en data na de header staat");
        return scores;
    }
    submissions.forEach(s => Logger.log(`Verwerkt: ${s.naam} | team: ${s.team} | score: ${s.vergelijkbareScore} | divisie: ${s.divisie} | geslacht: ${s.geslacht}`));

    // --- Deelname punten ---
    submissions.forEach(s => {
        if (scores[s.team]) scores[s.team].deelname += POINTS.DEELNAME;
    });

    // --- Ranking: 6 groepen (3 divisies × 2 geslachten) ---
    // Lager vergelijkbareScore = beter = meer punten
    DIVISIONS.forEach(div => {
        GENDERS.forEach(gen => {
            const groep = submissions.filter(s => s.divisie === div && s.geslacht === gen);
            if (!groep.length) return;

            // Sorteer: laagste vergelijkbareScore eerst (= beste prestatie)
            groep.sort((a, b) => a.vergelijkbareScore - b.vergelijkbareScore);

            // Punten: 1e plek = totaal in groep, aflopend naar 1
            groep.forEach((s, idx) => {
                if (scores[s.team]) scores[s.team].ranking += (groep.length - idx);
            });
        });
    });

    // --- Votes ---
    // Team Outfit & Community Spirit: winnaar op basis van PERCENTAGE van totale stemmen
    // (niet absoluut aantal) — zodat een groter team geen voordeel heeft.
    // Best Dressed: absoluut aantal stemmen (persoon, niet team — geen teamgrootte bias).

    const outfitV = {}, communityV = {}, bdV = {};
    let totalOutfitVotes = 0;
    let totalCommunityVotes = 0;

    submissions.forEach(s => {
        if (TEAMS.includes(s.voteOutfit)) {
            outfitV[s.voteOutfit] = (outfitV[s.voteOutfit] || 0) + 1;
            totalOutfitVotes++;
        }
        s.voteCommunity.forEach(t => {
            if (TEAMS.includes(t)) {
                communityV[t] = (communityV[t] || 0) + 1;
                totalCommunityVotes++;
            }
        });
        if (s.voteBestDressed) bdV[s.voteBestDressed] = (bdV[s.voteBestDressed] || 0) + 1;
    });

    // Converteer naar percentages
    const outfitPct = {}, communityPct = {};
    TEAMS.forEach(t => {
        outfitPct[t] = totalOutfitVotes > 0 ? (outfitV[t] || 0) / totalOutfitVotes : 0;
        communityPct[t] = totalCommunityVotes > 0 ? (communityV[t] || 0) / totalCommunityVotes : 0;
    });

    // Outfit winnaar: hoogste percentage
    const outfitWin = getWinnaar(outfitPct);
    if (outfitWin && scores[outfitWin]) scores[outfitWin].teamOutfit += POINTS.TEAM_OUTFIT;

    // Community spirit winnaar(s): hoogste percentage (gelijke stand = beiden 5pt)
    getWinnaars(communityPct).forEach(t => {
        if (scores[t]) scores[t].communitySpirit += POINTS.COMMUNITY_SPIRIT;
    });

    // Best dressed: absoluut (persoon, geen teamgrootte bias)
    const bdWin = getWinnaar(bdV);
    if (bdWin && deelnemers[bdWin] && scores[deelnemers[bdWin].team]) {
        scores[deelnemers[bdWin].team].bestDressed += POINTS.BEST_DRESSED;
    }

    return scores;
}

// ============================================================
// TOTAL SCORE SHEET BIJWERKEN
// ============================================================
function updateTotalScoreSheet(ss, teamTotalen) {
    const sheet = ss.getSheetByName("Total Score");
    if (!sheet) return;

    sheet.getRange(1, 1, 1, 7).setValues([[
        "Team", "Total Points", "Ranking Points", "Best Dressed",
        "Team Outfit", "Community Spirit", "Last updated"
    ]]).setFontWeight("bold");

    TEAMS.forEach((team, idx) => {
        const t = teamTotalen[team] || {};
        sheet.getRange(idx + 2, 1, 1, 7).setValues([[
            team, t.totaal || 0, t.ranking || 0, t.bestDressed || 0,
            t.teamOutfit || 0, t.communitySpirit || 0, new Date()
        ]]);
    });

    sheet.getRange("A7").setValue("JSON_SCORES");
    sheet.getRange("B7").setValue(JSON.stringify(teamTotalen));
    sheet.getRange("A8").setValue("BIJGEWERKT");
    sheet.getRange("B8").setValue(new Date().toISOString());
    // Rankings worden apart opgeslagen door buildScoreboardData() in B9
}

// ============================================================
// SETUP — eenmalig uitvoeren
// ============================================================
function setup() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Geslacht kolom toevoegen aan Deelnemers (kolom G)
    const dSheet = ss.getSheetByName("Deelnemers");
    if (!dSheet.getRange("G1").getValue()) {
        dSheet.getRange("G1").setValue("Geslacht").setFontWeight("bold");
        dSheet.getRange("G2:G200").setDataValidation(
            SpreadsheetApp.newDataValidation()
                .requireValueInList(["Man", "Vrouw"])
                .setAllowInvalid(false).build()
        );
    }

    // Week sheets inrichten
    ["26.1", "26.2", "26.3"].forEach(week => {
        let sheet = ss.getSheetByName(week);
        if (!sheet) sheet = ss.insertSheet(week);

        // Rij 1: uitleg
        sheet.getRange("A1").setValue(`Submissions ${week} — niet handmatig bewerken onder rij 3`);
        sheet.getRange("A1").setFontColor("#999999").setFontStyle("italic");

        // Rij 2: leeg (buffer)

        // Rij 3: headers
        sheet.getRange(3, 1, 1, 11).setValues([[
            "Timestamp", "Athlete name", "Score", "Division", "Score type",
            "Tiebreak time", "Vote: Best outfit", "Vote: Community spirit",
            "Vote: Best dressed", "Judge name", "Notes"
        ]]).setFontWeight("bold").setBackground("#E8F0FE");

        // Kolom breedte
        sheet.setColumnWidth(2, 180);
        sheet.setColumnWidth(3, 100);
    });

    // Total Score sheet
    setupTotalScoreSheet(ss);

    installeerTrigger();

    SpreadsheetApp.getUi().alert(
        "✅ Setup klaar!\n\n" +
        "Nog te doen:\n" +
        "1. Vul kolom G (Geslacht: Man/Vrouw) in bij alle deelnemers\n" +
        "2. Run 'maakJudgeForm' om het form aan te maken\n" +
        "3. Koppel het form aan sheet '26.1' via het form > Responses > Sheets-icoon\n" +
        "4. Deploy als Web App > Anyone > kopieer de URL naar de scoreboard site"
    );
}

function setupTotalScoreSheet(ss) {
    const sheet = ss.getSheetByName("Total Score");
    if (!sheet) return;
    sheet.getRange(1, 1, 1, 7).setValues([[
        "Team", "Total Points", "Ranking Points", "Best Dressed",
        "Team Outfit", "Community Spirit", "Last updated"
    ]]).setFontWeight("bold");
    TEAMS.forEach((team, idx) => sheet.getRange(idx + 2, 1).setValue(team));
}

// ============================================================
// JUDGE FORM AANMAKEN
// ============================================================
function maakJudgeForm() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const deelnemers = getDeelnemers(ss);
    const namen = Object.values(deelnemers).map(d => d.naam).sort((a, b) => a.localeCompare(b));

    const form = FormApp.create(`CrossFit Leiden Open ${ACTIEVE_WEEK} — Judge Form`);
    form.setDescription(
        `Open ${ACTIEVE_WEEK} — Wall-ball shots & Box step/jump-overs. ` +
        `For time, 12 min time cap. Fill this in after completing your workout.`
    );
    form.setCollectEmail(false);

    // 1. Naam
    form.addListItem()
        .setTitle("Athlete name")
        .setChoiceValues(namen)
        .setRequired(true);

    // 2. Division
    form.addMultipleChoiceItem()
        .setTitle("Division")
        .setChoiceValues(["Foundations", "Scaled", "Rx"])
        .setRequired(true);

    // 3. Score type
    form.addMultipleChoiceItem()
        .setTitle("Score type")
        .setChoices([
            form.addMultipleChoiceItem().createChoice("time — I finished the workout within the time cap"),
            form.addMultipleChoiceItem().createChoice("reps — I hit the time cap"),
        ])
        // Workaround: opnieuw als aparte item
        .setRequired(true);

    // 4. Score
    form.addTextItem()
        .setTitle("Score")
        .setHelpText(
            "If you finished: enter your time as mm:ss (e.g. 10:35)\n" +
            "If you hit the time cap: enter your total completed reps (e.g. 228)"
        )
        .setRequired(true);

    // 5. Tiebreak (alleen relevant bij reps)
    form.addTextItem()
        .setTitle("Tiebreak time (only if you hit the time cap)")
        .setHelpText(
            "Time of your LAST completed set of box step/jump-overs, as mm:ss (e.g. 08:42)\n" +
            "Leave blank if you finished."
        )
        .setRequired(false);

    // 6. Vote outfit
    form.addMultipleChoiceItem()
        .setTitle("Vote: Which team has the best outfit tonight?")
        .setChoiceValues(TEAMS)
        .setRequired(true);

    // 7. Vote community spirit
    form.addCheckboxItem()
        .setTitle("Vote: Which team shows the most community spirit? (multiple allowed)")
        .setChoiceValues(TEAMS)
        .setRequired(true);

    // 8. Vote best dressed
    form.addTextItem()
        .setTitle("Vote: Who is best dressed tonight? (enter name)")
        .setRequired(true);

    // 9. Judge naam
    form.addTextItem()
        .setTitle("Judge name")
        .setRequired(false);

    // 10. Opmerkingen
    form.addParagraphTextItem()
        .setTitle("Notes / remarks")
        .setRequired(false);

    Logger.log("Form edit URL: " + form.getEditUrl());
    Logger.log("Form deel URL: " + form.getPublishedUrl());

    SpreadsheetApp.getUi().alert(
        `✅ Judge Form created for ${ACTIEVE_WEEK}!\n\n` +
        `Share this link with athletes:\n${form.getPublishedUrl()}\n\n` +
        `Link the form to sheet "${ACTIEVE_WEEK}":\n` +
        `Open the form > Responses tab > Sheets icon (green) > Select existing spreadsheet`
    );
}

// ============================================================
// TRIGGER
// ============================================================
function onFormSubmit(e) {
    try {
        // Log wat er binnenkomt — helpt debuggen waarom trigger vuurt
        Logger.log("=== onFormSubmit aangeroepen: " + new Date() + " ===");
        if (e && e.values) {
            Logger.log("Form waarden: " + JSON.stringify(e.values));
        } else {
            Logger.log("GEEN form waarden in event — trigger vuurt zonder echte submission!");
        }
        buildScoreboardData();
        Logger.log("Scores bijgewerkt: " + new Date());
    } catch (err) {
        Logger.log("Fout: " + err);
    }
}

function installeerTrigger() {
    // Verwijder ALLE bestaande triggers (niet alleen onFormSubmit)
    ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

    // Installeer alleen de form submit trigger
    ScriptApp.newTrigger("onFormSubmit")
        .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
        .onFormSubmit().create();

    Logger.log("Trigger geïnstalleerd. Totaal actief: " + ScriptApp.getProjectTriggers().length);
}

// Run dit om te zien welke triggers er actief zijn
function lijstTriggers() {
    const triggers = ScriptApp.getProjectTriggers();
    Logger.log("Aantal actieve triggers: " + triggers.length);
    triggers.forEach((t, i) => {
        Logger.log(`Trigger ${i + 1}: functie="${t.getHandlerFunction()}" type="${t.getEventType()}" bron="${t.getTriggerSourceId()}"`);
    });
    if (triggers.length === 0) Logger.log("Geen triggers actief.");
}

// Run dit om ALLE triggers te wissen en opnieuw in te stellen
function resetTriggers() {
    const voor = ScriptApp.getProjectTriggers().length;
    ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger("onFormSubmit")
        .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
        .onFormSubmit().create();
    const na = ScriptApp.getProjectTriggers().length;
    Logger.log(`Triggers gereset: ${voor} verwijderd, ${na} nieuw geïnstalleerd.`);
}

// Handmatig herberekenen (voor testen)
function herbereken() {
    buildScoreboardData();
    Logger.log("Scores herberekend! Check de Total Score tab.");
}

// ============================================================
// HELPERS
// ============================================================
function initiTeamScores() {
    const s = {};
    TEAMS.forEach(t => {
        s[t] = { deelname: 0, ranking: 0, bestDressed: 0, teamOutfit: 0, communitySpirit: 0, totaal: 0, aantalDeelnemers: 0 };
    });
    return s;
}

// Converteert mm:ss of hh:mm:ss naar seconden
function parseSeconden(raw) {
    if (!raw && raw !== 0) return null;
    const str = String(raw).trim();
    if (str.includes(":")) {
        const parts = str.split(":").map(Number);
        if (parts.some(isNaN)) return null;
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const n = parseFloat(str.replace(",", "."));
    return isNaN(n) ? null : n;
}

function getWinnaar(votes) {
    const keys = Object.keys(votes);
    return keys.length ? keys.reduce((a, b) => votes[a] > votes[b] ? a : b) : null;
}

function getWinnaars(votes) {
    const keys = Object.keys(votes);
    if (!keys.length) return [];
    const max = Math.max(...Object.values(votes));
    return keys.filter(k => votes[k] === max);
}
