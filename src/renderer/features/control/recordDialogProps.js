export const recordDialogProps = {
  record: { type: Object, required: true },
  saving: Boolean,
  deleting: Boolean,
  error: { type: String, default: '' },
  canEdit: { type: Boolean, default: true },
  closing: Boolean,
  closingControl: Boolean,
  selectedCheckpoint: { type: String, default: '' },
  saveRecord: { type: Function, required: true },
  deleteRecord: { type: Function, required: true },
  closeControl: { type: Function, default: null },
};
