# Using a live HireLens interview

## Company and HR preparation

Each company invites the HR's registered email. The HR accepts the invitation,
selects that company in the workspace, and accepts its job interview request.
One HR account can join several companies. Candidate assignments and job access
remain separate, while scheduling checks avoid overlapping appointments across
companies. See [multiple companies](HR-MULTIPLE-COMPANIES.md).

## Candidate

Open the assigned interview, check the camera and microphone, prepare the resume
submitted for the job, and read the monitoring notice. Enter the waiting room.
The assigned HR starts the interview and admits the candidate.

Face and object checks have separate candidate controls. Enable the checks you
consent to before expecting detections. Keep the interview page visible and the
camera on. Loading, paused, off, unavailable and receiving-estimates states are
shown explicitly. Camera permission alone does not enable optional monitoring.

The Face check uses BlazeFace, with Face Landmarker as a load-failure fallback.
It reports face presence and counts, not identity. Object detection provides
EfficientDet-Lite0 and a higher-detail EfficientDet-Lite2 mode. The higher-detail
mode uses more device resources. Poor lighting and unsupported objects can affect
results; no detection is not proof that an object is absent.

## HR / interviewer

HR camera and microphone are used for the call. HR's own camera does not run the
candidate face/object checks. HR sees the assigned application, candidate video,
shared resume, instructions/questions, code review and private notes.

Candidate camera checks display consented, candidate-device-reported metadata
alongside the candidate video. No camera pixels are uploaded by these checks.
The candidate sends bounded metadata about every five seconds; the authorized
room refresh retrieves the latest status. Old status is marked stale after
20 seconds and old overlays are hidden. A disconnected device is never shown as
an actively working detector. Withdrawal clears the relevant metadata.

Review sustained events in Activity, discuss context, and record human feedback.
Detector estimates do not identify cheating or automatically decide hiring.

## Verification limits

Automated tests cover role separation, camera lifecycle, stale frames, consent,
metadata authorization, company isolation and interview workflow. They do not
establish physical-camera accuracy for every device, lighting condition or object.
The optional gaze feature remains experimental and requires successful calibration.
