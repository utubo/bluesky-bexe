export const customDialogStore = $state({
  isOpen: false,
  title: '',
  message: '',
  placeholder: '',
  initialValue: '',
  imageUrl: '',
  showInput: true,
  showIconPicker: false,
  iconPresets: [] as string[],
  suggestions: [] as string[],
  resolve: null as ((val: string | null) => void) | null,
});

export function openInputDialog(
  title: string,
  initialValue: string,
  suggestions: string[],
  placeholder: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    customDialogStore.title = title;
    customDialogStore.message = '';
    customDialogStore.placeholder = placeholder;
    customDialogStore.initialValue = initialValue;
    customDialogStore.imageUrl = '';
    customDialogStore.showInput = true;
    customDialogStore.showIconPicker = false;
    customDialogStore.iconPresets = [];
    customDialogStore.suggestions = suggestions;
    customDialogStore.isOpen = true;
    customDialogStore.resolve = resolve;
  });
}

export function openConfirmDialog(message: string): Promise<string | null> {
  return new Promise((resolve) => {
    customDialogStore.title = '';
    customDialogStore.message = message;
    customDialogStore.showInput = false;
    customDialogStore.showIconPicker = false;
    customDialogStore.iconPresets = [];
    customDialogStore.isOpen = true;
    customDialogStore.resolve = resolve;
  });
}

export function openIconPickerDialog(
  title: string,
  presets: ReadonlyArray<string>,
  initialIcon = '',
): Promise<string | null> {
  return new Promise((resolve) => {
    customDialogStore.title = title;
    customDialogStore.message = '';
    customDialogStore.initialValue = initialIcon;
    customDialogStore.imageUrl = '';
    customDialogStore.showInput = false;
    customDialogStore.showIconPicker = true;
    customDialogStore.iconPresets = [...presets];
    customDialogStore.suggestions = [];
    customDialogStore.isOpen = true;
    customDialogStore.resolve = resolve;
  });
}

export function closeDialog(result: string | null = null) {
  customDialogStore.isOpen = false;
  customDialogStore.showIconPicker = false;
  customDialogStore.iconPresets = [];
  if (customDialogStore.resolve) {
    customDialogStore.resolve(result);
    customDialogStore.resolve = null;
  }
}
