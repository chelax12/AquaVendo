export const getCoinStatus = (count: number): { level: 'OK' | 'LOW' | 'CRITICAL'; text: string } => {
  if (count === 0) {
    return { level: 'CRITICAL', text: 'OUT OF CHANGE' };
  }
  if (count < 20) {
    return { level: 'LOW', text: 'LOW' };
  }
  return { level: 'OK', text: 'OK' };
};
