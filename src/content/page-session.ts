export type PageSessionStatus =
  | 'idle'
  | 'translating'
  | 'translated'
  | 'partial-success';

let currentStatus: PageSessionStatus = 'idle';

export function setPageSessionStatus(status: PageSessionStatus) {
  currentStatus = status;
}

export function getPageSessionStatus() {
  return currentStatus;
}
