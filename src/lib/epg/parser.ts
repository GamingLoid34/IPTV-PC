import * as sax from "sax";
import type { EpgChannel, EpgProgramme } from "@/types/epg";

type ChannelDraft = {
  id: string;
  displayName: string;
  icon?: string;
};

type ProgrammeDraft = {
  channelId: string;
  start: string;
  stop: string;
  title: string;
  description?: string;
  categories: string[];
  episodeNum?: string;
};

export function parseXmltvDate(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{14})(?:\s+([+-]\d{4}))?$/);
  if (!match) {
    throw new Error(`Ogiltigt XMLTV-datum: ${value}`);
  }

  const ymdhms = match[1];
  const tz = match[2] ?? "+0000";
  const year = Number(ymdhms.slice(0, 4));
  const month = Number(ymdhms.slice(4, 6));
  const day = Number(ymdhms.slice(6, 8));
  const hour = Number(ymdhms.slice(8, 10));
  const minute = Number(ymdhms.slice(10, 12));
  const second = Number(ymdhms.slice(12, 14));

  if (month < 1 || month > 12) throw new Error(`Ogiltig månad i datum: ${value}`);
  if (day < 1 || day > 31) throw new Error(`Ogiltig dag i datum: ${value}`);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Ogiltig tid i datum: ${value}`);
  }

  const sign = tz.startsWith("-") ? -1 : 1;
  const tzHours = Number(tz.slice(1, 3));
  const tzMinutes = Number(tz.slice(3, 5));
  if (tzHours > 23 || tzMinutes > 59) {
    throw new Error(`Ogiltig timezone i datum: ${value}`);
  }
  const offsetMs = sign * (tzHours * 60 + tzMinutes) * 60 * 1000;

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs;
  const iso = new Date(utcMs).toISOString();

  if (Number.isNaN(Date.parse(iso))) {
    throw new Error(`Kunde inte konvertera XMLTV-datum: ${value}`);
  }
  return iso;
}

export async function parseXmltvStream(
  stream: NodeJS.ReadableStream,
  onChannel: (channel: EpgChannel) => void,
  onProgramme: (programme: EpgProgramme) => void
): Promise<void> {
  return await new Promise<void>((resolve, reject) => {
    const parser = sax.parser(false, {
      trim: true,
      normalize: true,
      lowercase: false,
      xmlns: false,
      position: true,
    });

    let currentChannel: ChannelDraft | null = null;
    let currentProgramme: ProgrammeDraft | null = null;
    let activeTextTag:
      | "display-name"
      | "title"
      | "desc"
      | "category"
      | "episode-num"
      | null = null;
    let textBuffer = "";
    let settled = false;

    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    parser.onopentag = (node) => {
      const tag = node.name.toLowerCase();

      if (tag === "channel") {
        const id = String(node.attributes.id ?? "").trim();
        if (!id) {
          finishReject(new Error("XMLTV channel saknar id."));
          return;
        }
        currentChannel = { id, displayName: "" };
        return;
      }

      if (tag === "icon" && currentChannel) {
        const src = String(node.attributes.src ?? "").trim();
        if (src) {
          currentChannel.icon = src;
        }
        return;
      }

      if (tag === "programme") {
        const channelId = String(node.attributes.channel ?? "").trim();
        const startRaw = String(node.attributes.start ?? "").trim();
        const stopRaw = String(node.attributes.stop ?? "").trim();
        if (!channelId || !startRaw || !stopRaw) {
          finishReject(new Error("XMLTV programme saknar channel/start/stop."));
          return;
        }
        try {
          currentProgramme = {
            channelId,
            start: parseXmltvDate(startRaw),
            stop: parseXmltvDate(stopRaw),
            title: "",
            categories: [],
          };
        } catch (error) {
          finishReject(error);
        }
        return;
      }

      if (
        tag === "display-name" ||
        tag === "title" ||
        tag === "desc" ||
        tag === "category" ||
        tag === "episode-num"
      ) {
        activeTextTag = tag;
        textBuffer = "";
      }
    };

    parser.ontext = (text) => {
      if (!activeTextTag) return;
      textBuffer += text;
    };

    parser.oncdata = (text) => {
      if (!activeTextTag) return;
      textBuffer += text;
    };

    parser.onclosetag = (name) => {
      const tag = String(name).toLowerCase();
      const normalizedText = textBuffer.trim();

      if (tag === "display-name" && currentChannel && normalizedText) {
        if (!currentChannel.displayName) {
          currentChannel.displayName = normalizedText;
        }
      } else if (tag === "title" && currentProgramme && normalizedText) {
        currentProgramme.title = normalizedText;
      } else if (tag === "desc" && currentProgramme && normalizedText) {
        currentProgramme.description = normalizedText;
      } else if (tag === "category" && currentProgramme && normalizedText) {
        currentProgramme.categories.push(normalizedText);
      } else if (tag === "episode-num" && currentProgramme && normalizedText) {
        currentProgramme.episodeNum = normalizedText;
      } else if (tag === "channel" && currentChannel) {
        if (!currentChannel.displayName) {
          currentChannel.displayName = currentChannel.id;
        }
        onChannel({
          id: currentChannel.id,
          displayName: currentChannel.displayName,
          icon: currentChannel.icon,
        });
        currentChannel = null;
      } else if (tag === "programme" && currentProgramme) {
        if (!currentProgramme.title) {
          currentProgramme.title = "(untitled)";
        }
        onProgramme({
          channelId: currentProgramme.channelId,
          start: currentProgramme.start,
          stop: currentProgramme.stop,
          title: currentProgramme.title,
          description: currentProgramme.description,
          categories: currentProgramme.categories,
          episodeNum: currentProgramme.episodeNum,
        });
        currentProgramme = null;
      }

      if (tag === activeTextTag) {
        activeTextTag = null;
        textBuffer = "";
      }
    };

    parser.onerror = (err) => {
      console.warn("[EPG] sax parser warning:", err.message);
      (parser as any).error = null;
      parser.resume();
    };

    parser.onend = () => {
      finishResolve();
    };

    stream.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      try {
        const str = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        parser.write(str);
      } catch (error) {
        finishReject(error);
      }
    });

    stream.on("end", () => {
      if (settled) return;
      try {
        parser.close();
      } catch (error) {
        finishReject(error);
      }
    });

    stream.on("error", (error) => {
      finishReject(error);
    });
  });
}
