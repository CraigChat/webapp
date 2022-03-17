export interface Recording {
  connectionToken: string;
  clientId: string;
  clientName?: string;
  flacEnabled: boolean;
  continuousEnabled: boolean;
  serverName: string;
  serverIcon?: string;
  channelName: string;
  channelType: 2 | 13;
}

export async function getRecording(host: string, id: string, key: string): Promise<Recording> {
  const response = await fetch(`${host}/info/${id}/${key}`);
  if (response.status !== 200) throw response;
  return response.json().then((data) => data.recording);
}
