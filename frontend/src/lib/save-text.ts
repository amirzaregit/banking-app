import { Share } from 'react-native';

/** Phone: open the system share sheet with the file's text (email it, save to Drive/Notes, ...). */
export async function saveText(filename: string, text: string): Promise<void> {
  await Share.share({ title: filename, message: text });
}
