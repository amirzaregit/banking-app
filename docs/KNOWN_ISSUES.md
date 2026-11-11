# Known issues

Open problems, written down so they are not forgotten. Remove an entry when it is fixed and verified on a phone.

## 1. Saving and sharing generated PDFs on Android (Expo Go)

**Affects:** every screen that offers a PDF: certificates (Documents), insurance policies and transaction receipts. All of them go through
`frontend/src/hooks/use-pdf-document.ts` and `frontend/src/certificates/pdf.ts`, so one fix covers all three.

**Symptom.** The PDF is created, and "View" works, but:
- **Share** opens the system share sheet, then WhatsApp and Telegram answer *"unsupported file"*.
- **Save to phone** (folder picker) has not been confirmed to produce a file that opens.

**What has been established**
- The expo-sharing call is rejected with *"Not allowed to read file under given URL"* for a copy made with the new `expo-file-system`
  API (`Paths.cache`) and for the print engine's own file. A copy written with the **legacy** API
  (`expo-file-system/legacy`, `cacheDirectory`) is accepted, so Expo Go seems to allow only some folders.
- Once accepted, the share sheet opens but the receiving apps reject the file. Whether the bytes are a valid PDF on the phone is **not yet
  proven**: the app checks that the file starts with `%PDF`, but a phone-side confirmation is missing. (Test: save to Downloads, open it
  in a PDF viewer.)
- The expo-sharing Android code, the print engine's output and the legacy writer all look correct when read.

**Tried and rejected**
- Copying the file to a nicely named file in `Paths.cache` (new API): the share sheet may not read it.
- Sending with `expo-intent-launcher` and `android.intent.action.SEND`: it passes the file link as plain text, so WhatsApp received only text.
  Removed again.

**Ideas for later**
1. Confirm on the phone whether the saved PDF opens (decides: broken file, or only a hand-off problem).
2. Try sharing another file type (an image) the same way, and another target app (Gmail, Drive), to see whether sharing from Expo Go works at all.
3. Try a **development build** (EAS) instead of Expo Go: the file permission rules differ and sharing is the more usual path there.
4. If needed, write a tiny native module (or use `react-native-share`) that attaches the file with an explicit read grant.

Meanwhile "Save to phone" and "Print or save as PDF" are the ways to get the file out.
