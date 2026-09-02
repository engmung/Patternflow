# rtpmidi-probe

A 170-line RTP-MIDI (AppleMIDI) session initiator in plain Python, for
checking a panel's MIDI feature from a machine with no MIDI driver installed
— a CI box, a Windows PC without rtpMIDI, a Raspberry Pi.

```
python tools/rtpmidi-probe/rtpmidi_probe.py <panel-ip> [port]
```

It opens a session on the panel's control and data ports, answers clock
sync, then walks the whole of [`docs/midi-spec.md`](../../docs/midi-spec.md):
absolute CCs onto the bus, a relative CC, a Program Change, a note, and one
outbound Program Change triggered over HTTP — printing `/api/status` after
each step so the effect is visible without eyes on the panel. It says
goodbye with `BY` at the end.

Standard library only. It does not implement the recovery journal, so it is
a test tool and not a MIDI port.
