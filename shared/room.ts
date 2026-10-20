export interface RoomState {
  interviewerName: string;
  candidateName: string;
  waitingAt?: string;
  admittedAt?: string;
  resumeId?: string;
  resumeName?: string;
  resumeSharedAt?: string;
  cameraAccommodation: boolean;
  screenRequired: boolean;
  entireScreen: boolean;
  faceConsent: boolean;
  objectConsent?: boolean;
  instruction?: {
    text: string;
    at: string;
    kind: "instruction" | "screen-request";
  };
  codingPrompt?: string;
  codingSentAt?: string;
  activeLanguage: string;
}
