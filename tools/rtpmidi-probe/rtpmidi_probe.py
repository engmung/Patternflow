"""Minimal AppleMIDI (RTP-MIDI, RFC 6295) session initiator for testing a
Patternflow panel from a PC with no MIDI driver installed.

    python rtpmidi_probe.py <device-ip> [port]

Opens a session, sends a scripted set of messages, and prints what the
device sends back. Pure UDP, standard library only.
"""
import socket, struct, sys, time, random, threading

DEV = sys.argv[1] if len(sys.argv) > 1 else "192.168.0.180"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 5004

SSRC = random.getrandbits(32)
TOKEN = random.getrandbits(32)
NAME = b"pf-probe"

ctl = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
dat = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
ctl.bind(("", 0)); dat.bind(("", ctl.getsockname()[1] + 1))
ctl.settimeout(3); dat.settimeout(3)


def invite(sock, port):
    pkt = struct.pack("!HHIII", 0xFFFF, 0x494E, 2, TOKEN, SSRC) + NAME + b"\0"
    sock.sendto(pkt, (DEV, port))
    data, addr = sock.recvfrom(1500)
    sig, cmd, ver, tok, ssrc = struct.unpack("!HHIII", data[:16])
    name = data[16:].split(b"\0")[0].decode(errors="replace")
    ok = cmd == 0x4F4B and tok == TOKEN
    print(f"  invite {port}: {'OK' if ok else 'NO'} peer ssrc={ssrc:08x} name={name!r}")
    return ssrc if ok else None


def now_ts():
    return int(time.time() * 10000) & 0xFFFFFFFFFFFFFFFF


def clock_sync(peer):
    pkt = struct.pack("!HHIB3xQQQ", 0xFFFF, 0x434B, SSRC, 0, now_ts(), 0, 0)
    dat.sendto(pkt, (DEV, PORT + 1))
    data, _ = dat.recvfrom(1500)
    sig, cmd, ssrc, count = struct.unpack("!HHIB", data[:9])
    ts1, ts2, ts3 = struct.unpack("!QQQ", data[12:36])
    print(f"  clock sync: count={count} ts2={ts2}")
    pkt = struct.pack("!HHIB3xQQQ", 0xFFFF, 0x434B, SSRC, 2, ts1, ts2, now_ts())
    dat.sendto(pkt, (DEV, PORT + 1))


seq = random.getrandbits(16)


def send_midi(*msgs):
    """msgs: list of byte sequences; sent as one RTP packet, zero deltas."""
    global seq
    body = b""
    for i, m in enumerate(msgs):
        if i > 0:
            body += b"\0"        # delta time 0 between commands
        body += bytes(m)
    hdr = bytes([0x80, 0xE1]) + struct.pack("!HII", seq & 0xFFFF, now_ts() & 0xFFFFFFFF, SSRC)
    seq += 1
    if len(body) < 16:
        cs = bytes([len(body)])
    else:
        cs = struct.pack("!H", 0x8000 | len(body))
    dat.sendto(hdr + cs + body, (DEV, PORT + 1))


received = []


def listener():
    dat.settimeout(0.5)
    while True:
        try:
            data, _ = dat.recvfrom(1500)
        except socket.timeout:
            continue
        except OSError:
            return
        if data[:2] == b"\xff\xff":
            cmd = data[2:4]
            if cmd == b"CK":
                # device-initiated sync: answer count 1
                ssrc, count = struct.unpack("!IB", data[4:9])
                ts1 = struct.unpack("!Q", data[12:20])[0]
                if count == 0:
                    dat.sendto(struct.pack("!HHIB3xQQQ", 0xFFFF, 0x434B, SSRC, 1, ts1, now_ts(), 0), (DEV, PORT + 1))
            continue
        if len(data) < 13:
            continue
        flags = data[12]
        if flags & 0x80:
            ln = ((flags & 0x0F) << 8) | data[13]; off = 14
        else:
            ln = flags & 0x0F; off = 13
        payload = data[off:off + ln]
        received.append(payload)
        print(f"  <- MIDI {payload.hex(' ')}")


def ctl_listener():
    ctl.settimeout(0.5)
    while True:
        try:
            data, _ = ctl.recvfrom(1500)
        except socket.timeout:
            continue
        except OSError:
            return
        if data[:4] == b"\xff\xffCK":
            ssrc, count = struct.unpack("!IB", data[4:9])
            ts1 = struct.unpack("!Q", data[12:20])[0]
            if count == 0:
                ctl.sendto(struct.pack("!HHIB3xQQQ", 0xFFFF, 0x434B, SSRC, 1, ts1, now_ts(), 0), (DEV, PORT))


def bye():
    ctl.sendto(struct.pack("!HHIII", 0xFFFF, 0x4259, 2, TOKEN, SSRC), (DEV, PORT))


if __name__ == "__main__":
    import json, urllib.request

    def status():
        with urllib.request.urlopen(f"http://{DEV}/api/status", timeout=8) as r:
            return json.load(r)

    print("session:")
    peer = invite(ctl, PORT)
    if peer is None:
        sys.exit(1)
    invite(dat, PORT + 1)
    clock_sync(peer)
    threading.Thread(target=listener, daemon=True).start()
    threading.Thread(target=ctl_listener, daemon=True).start()
    time.sleep(0.5)
    st = status()
    print("status:", {k: st[k] for k in ("knobs", "params", "paramActive", "active")}, st.get("midi"))

    print("CC20=127 (knob1 absolute -> 1000)")
    send_midi([0xB0, 20, 127]); time.sleep(0.6)
    st = status(); print("  params", st["params"], "active", st["paramActive"])

    print("CC21=0, CC22=64, CC23=100")
    send_midi([0xB0, 21, 0], [0xB0, 22, 64], [0xB0, 23, 100]); time.sleep(0.6)
    st = status(); print("  params", st["params"], "active", st["paramActive"])

    k0 = st["knobs"][0]
    print("CC24=67 (knob1 +3 detents)")
    send_midi([0xB0, 24, 67]); time.sleep(0.6)
    st = status(); print("  knobs", st["knobs"], "(was", k0, ")")

    print("Program Change 2")
    before = st["active"]
    send_midi([0xC0, 2]); time.sleep(1.5)
    st = status(); print("  active", repr(before), "->", repr(st["active"]))

    print("Note on/off 60 (button 1 press)")
    send_midi([0x90, 60, 127]); time.sleep(0.2); send_midi([0x80, 60, 0]); time.sleep(0.4)
    st = status(); print("  midi", st.get("midi"))

    print("outbound: select pattern 1 over HTTP, expect Program Change back")
    received.clear()
    urllib.request.urlopen(f"http://{DEV}/api/patterns/select?index=1", timeout=8).read()
    time.sleep(1.5)
    print("  received", [p.hex(' ') for p in received])
    st = status(); print("  midi", st.get("midi"))

    bye()
    time.sleep(0.3)
    st = status(); print("after BY:", st.get("midi"))
