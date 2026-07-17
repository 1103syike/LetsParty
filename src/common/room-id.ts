export function createRoomId(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function isValidRoomId(roomId: string): boolean {
  return /^\d{6}$/.test(roomId);
}
