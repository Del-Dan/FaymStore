/**
 * LOCATIONS.gs
 * Handles generation and management of massive Ghana Location Data.
 */

function setupGhanaLocations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = 'LOCATIONS';
  let sheet = ss.getSheetByName(sheetName);
  
  // Re-create Sheet to ensure clean slate and correct headers
  if (sheet) { ss.deleteSheet(sheet); }
  sheet = ss.insertSheet(sheetName);
  
  // Headers
  const headers = ["Region", "Town_City", "Area_Locality", "Delivery_Price", "Is_Active"];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#E0E0E0");
  
  // DATA SEED (Starter Pack)
  // Structure: [Region, Town, Area, Price, "TRUE"]
  // Prices are placeholders (e.g., 20, 30, 40)
  const data = [];
  
  // --- GREATER ACCRA ---
  const accraBase = [
      // Accra Metro
      ["Greater Accra", "Accra Metro", "Airport Residential", 30],
      ["Greater Accra", "Accra Metro", "Cantonments", 30],
      ["Greater Accra", "Accra Metro", "Labone", 30],
      ["Greater Accra", "Accra Metro", "Osu", 25],
      ["Greater Accra", "Accra Metro", "Ridge", 25],
      ["Greater Accra", "Accra Metro", "Abelemkpe", 35],
      ["Greater Accra", "Accra Metro", "Dzorwulu", 35],
      ["Greater Accra", "Accra Metro", "Roman Ridge", 35],
      ["Greater Accra", "Accra Metro", "Kanda", 25],
      ["Greater Accra", "Accra Metro", "Nima", 20],
      ["Greater Accra", "Accra Metro", "Maamobi", 20],
      ["Greater Accra", "Accra Metro", "New Town", 20],
      ["Greater Accra", "Accra Metro", "Adabraka", 20],
      ["Greater Accra", "Accra Metro", "Circle", 20],
      ["Greater Accra", "Accra Metro", "Tesano", 25],
      ["Greater Accra", "Accra Metro", "Achimota", 30],
      ["Greater Accra", "Accra Metro", "Dome", 35],
      ["Greater Accra", "Accra Metro", "Kwabenya", 40],
      ["Greater Accra", "Accra Metro", "Pokuase", 50],
      ["Greater Accra", "Accra Metro", "Amasaman", 60],
      
      // East Legon / Environs
      ["Greater Accra", "East Legon", "East Legon Main", 35],
      ["Greater Accra", "East Legon", "Adjiringanor", 40],
      ["Greater Accra", "East Legon", "American House", 35],
      ["Greater Accra", "East Legon", "Bawaleshie", 35],
      ["Greater Accra", "East Legon", "Mempeasem", 35],
      ["Greater Accra", "East Legon", "Shiashie", 30],
      
      // Spintex / Tema
      ["Greater Accra", "Spintex", "Spintex Road (Main)", 40],
      ["Greater Accra", "Spintex", "Manet", 40],
      ["Greater Accra", "Spintex", "Coca Cola", 40],
      ["Greater Accra", "Spintex", "Sakumono", 45],
      ["Greater Accra", "Spintex", "Lashibi", 45],
      ["Greater Accra", "Tema", "Comm 1", 50],
      ["Greater Accra", "Tema", "Comm 2", 50],
      ["Greater Accra", "Tema", "Comm 4", 50],
      ["Greater Accra", "Tema", "Comm 9", 50],
      ["Greater Accra", "Tema", "Comm 11", 50],
      ["Greater Accra", "Tema", "Comm 25", 60],
      ["Greater Accra", "Tema", "Michel Camp", 65],
      ["Greater Accra", "Tema", "Afienya", 70],
      ["Greater Accra", "Tema", "Prampram", 80],
      ["Greater Accra", "Tema", "Dawhenya", 80],

      // West / Dansoman
      ["Greater Accra", "Accra West", "Dansoman", 30],
      ["Greater Accra", "Accra West", "Mataheko", 25],
      ["Greater Accra", "Accra West", "Mamprobi", 30],
      ["Greater Accra", "Accra West", "Korle Bu", 25],
      ["Greater Accra", "Accra West", "Chorkor", 30],
      ["Greater Accra", "Accra West", "Lapaz", 30],
      ["Greater Accra", "Accra West", "Odorkor", 30],
      ["Greater Accra", "Accra West", "McCarthy Hill", 40],
      ["Greater Accra", "Accra West", "Weija", 45],
      ["Greater Accra", "Accra West", "Kasoa", 60],
      ["Greater Accra", "Accra West", "Buduburam", 70]
  ];

  // --- ASHANTI ---
  const ashantiBase = [
      ["Ashanti", "Kumasi", "Adum", 40],
      ["Ashanti", "Kumasi", "Nhyiaeso", 40],
      ["Ashanti", "Kumasi", "Ahodwo", 40],
      ["Ashanti", "Kumasi", "Bantama", 40],
      ["Ashanti", "Kumasi", "Kejetia", 40],
      ["Ashanti", "Kumasi", "KNUST Campus", 45],
      ["Ashanti", "Kumasi", "Oforikrom", 45],
      ["Ashanti", "Kumasi", "Ayigya", 45],
      ["Ashanti", "Kumasi", "Santasi", 50],
      ["Ashanti", "Kumasi", "Suame", 45],
      ["Ashanti", "Kumasi", "Tafo", 50],
      ["Ashanti", "Kumasi", "Asokwa", 45],
      ["Ashanti", "Kumasi", "Atonsu", 50]
  ];

  // --- CENTRAL ---
  const centralBase = [
      ["Central", "Cape Coast", "Cape Coast Campus (UCC)", 50],
      ["Central", "Cape Coast", "Elmina", 60],
      ["Central", "Cape Coast", "Moree", 60],
      ["Central", "Winneba", "Winneba Town", 50],
      ["Central", "Winneba", "UEW Campus", 50]
  ];

  // Format and Add Is_Active
  const combined = [...accraBase, ...ashantiBase, ...centralBase];
  const finalRows = combined.map(row => [...row, "TRUE"]);
  
  // Bulk Write (Fast)
  if (finalRows.length > 0) {
      sheet.getRange(2, 1, finalRows.length, finalRows[0].length).setValues(finalRows);
  }

  SpreadsheetApp.getUi().alert(`Success: Generated ${finalRows.length} Locations across Ghana.`);
}
