/**
 * Waitlist Form Handler for alexexploresitall.com
 * 
 * This script receives form submissions, saves them to a Google Sheet,
 * and sends email notifications to Alex.
 * 
 * Setup instructions: See WAITLIST_SETUP.md
 */

// Configuration - these values are set automatically when bound to a sheet
const NOTIFICATION_EMAIL = 'alexcentered@gmail.com';
const SHEET_NAME = 'Signups';

/**
 * Handle POST requests from the waitlist form
 */
function doPost(e) {
  try {
    // Parse the incoming data
    const data = JSON.parse(e.postData.contents);
    const email = data.email;
    const timestamp = data.timestamp || new Date().toISOString();
    
    // Basic validation
    if (!email || !isValidEmail(email)) {
      return createResponse(false, 'Invalid email address');
    }
    
    // Get or create the spreadsheet sheet
    const sheet = getOrCreateSheet();
    
    // Check for duplicates
    if (isDuplicate(sheet, email)) {
      // Still return success to the user, but note it in the log
      Logger.log('Duplicate signup attempt: ' + email);
      return createResponse(true, 'Already on the list');
    }
    
    // Append the data to the sheet
    const formattedTimestamp = new Date(timestamp);
    sheet.appendRow([
      formattedTimestamp,
      email,
      'Pending'
    ]);
    
    // Send notification email to Alex
    sendNotificationEmail(email, formattedTimestamp);
    
    // Return success
    return createResponse(true, 'Signup recorded');
    
  } catch (error) {
    Logger.log('Error processing signup: ' + error.toString());
    return createResponse(false, 'Server error: ' + error.toString());
  }
}

/**
 * Handle GET requests (for testing)
 */
function doGet(e) {
  return ContentService
    .createTextOutput('Waitlist API is running. Use POST to submit signups.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Get or create the signups sheet
 */
function getOrCreateSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    // Add headers
    sheet.appendRow(['Timestamp', 'Email', 'Status']);
    sheet.getRange('A1:C1').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 250);
    sheet.setColumnWidth(3, 100);
  }
  
  return sheet;
}

/**
 * Check if an email already exists in the sheet
 */
function isDuplicate(sheet, email) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  
  const emailColumn = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  const normalizedEmail = email.toLowerCase().trim();
  
  for (let i = 0; i < emailColumn.length; i++) {
    if (emailColumn[i][0] && emailColumn[i][0].toString().toLowerCase().trim() === normalizedEmail) {
      return true;
    }
  }
  
  return false;
}

/**
 * Send notification email to Alex
 */
function sendNotificationEmail(email, timestamp) {
  const subject = 'New Waitlist Signup - alexexploresitall.com';
  const body = `New waitlist signup:\n\n` +
               `Email: ${email}\n` +
               `Time: ${timestamp.toString()}\n\n` +
               `View all signups:\n${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`;
  
  try {
    MailApp.sendEmail({
      to: NOTIFICATION_EMAIL,
      subject: subject,
      body: body
    });
  } catch (error) {
    Logger.log('Failed to send notification email: ' + error.toString());
    // Don't fail the whole request if email fails
  }
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Create a JSON response
 */
function createResponse(success, message) {
  const output = {
    success: success,
    message: message
  };
  
  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}
