
export enum Sender {
  User = 'user',
  Agent = 'agent',
}

export interface Message {
  id: string;
  sender: Sender;
  text: string;
}
