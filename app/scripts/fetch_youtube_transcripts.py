#!/usr/bin/env python3
"""
YouTube Transcript Fetcher for Board of Directors RAG

Fetches transcripts from top videos of specified YouTube channels.
Outputs one JSON file per video for easy chunking and upload.

Usage:
    python3 app/scripts/fetch_youtube_transcripts.py
    python3 app/scripts/fetch_youtube_transcripts.py --limit 10
    python3 app/scripts/fetch_youtube_transcripts.py --channels path/to/channels.json
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import scrapetube
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)


def get_script_dir() -> Path:
    """Get the directory where this script is located."""
    return Path(__file__).parent


def load_channels(channels_path: Path) -> list[dict]:
    """Load channel configuration from JSON file."""
    with open(channels_path, "r", encoding="utf-8") as f:
        channels = json.load(f)

    # Validate structure
    for channel in channels:
        if "channelUrl" not in channel or "name" not in channel:
            raise ValueError(
                f"Invalid channel config: {channel}. "
                "Each channel must have 'channelUrl' and 'name' fields."
            )

    return channels


def get_channel_handle(channel_url: str) -> str:
    """Extract handle/identifier from channel URL for folder naming."""
    # Handle @username URLs: https://www.youtube.com/@TheDiaryOfACEO
    if "/@" in channel_url:
        return channel_url.split("/@")[-1].split("/")[0]
    # Handle /channel/ URLs: https://www.youtube.com/channel/UC1234
    if "/channel/" in channel_url:
        return channel_url.split("/channel/")[-1].split("/")[0]
    # Handle /c/ URLs: https://www.youtube.com/c/ChannelName
    if "/c/" in channel_url:
        return channel_url.split("/c/")[-1].split("/")[0]
    # Fallback: use last path segment
    return channel_url.rstrip("/").split("/")[-1]


def fetch_channel_videos(channel_url: str, limit: int) -> list[dict]:
    """
    Fetch top videos from a channel sorted by popularity (view count).

    Returns list of video metadata dicts.
    """
    videos = []

    try:
        # scrapetube returns a generator, convert to list
        video_generator = scrapetube.get_channel(
            channel_url=channel_url, limit=limit, sort_by="popular"
        )

        for video in video_generator:
            video_data = {
                "videoId": video.get("videoId"),
                "title": video.get("title", {}).get("runs", [{}])[0].get("text", "Unknown Title"),
                "viewCount": int(video.get("viewCountText", {}).get("simpleText", "0 views").replace(" views", "").replace(",", "").replace(".", "") or 0),
                "duration": video.get("lengthText", {}).get("simpleText", "0:00"),
                "publishedTime": video.get("publishedTimeText", {}).get("simpleText", "Unknown"),
            }
            videos.append(video_data)

    except Exception as e:
        print(f"  ⚠️  Error fetching videos: {e}")

    return videos


def fetch_transcript(video_id: str, languages: list[str] = None) -> str | None:
    """
    Fetch transcript for a video.

    Args:
        video_id: YouTube video ID
        languages: Preferred languages in order (default: ['en'])

    Returns:
        Full transcript text or None if unavailable
    """
    if languages is None:
        languages = ["en"]

    try:
        ytt_api = YouTubeTranscriptApi()
        transcript = ytt_api.fetch(video_id, languages=languages)

        # Join all snippets into full text
        full_text = " ".join(snippet.text for snippet in transcript)
        return full_text

    except (NoTranscriptFound, TranscriptsDisabled, VideoUnavailable) as e:
        print(f"    ⚠️  Transcript unavailable: {type(e).__name__}")
        return None
    except Exception as e:
        print(f"    ⚠️  Error fetching transcript: {e}")
        return None


def save_transcript(
    output_dir: Path,
    channel_handle: str,
    channel_url: str,
    channel_name: str,
    video_data: dict,
    transcript_text: str,
) -> Path:
    """
    Save transcript to JSON file.

    Creates channel subdirectory if needed.
    Returns path to saved file.
    """
    # Create channel directory
    channel_dir = output_dir / channel_handle
    channel_dir.mkdir(parents=True, exist_ok=True)

    # Build output data
    output_data = {
        "videoId": video_data["videoId"],
        "videoUrl": f"https://youtube.com/watch?v={video_data['videoId']}",
        "channelUrl": channel_url,
        "channelName": channel_name,
        "title": video_data["title"],
        "viewCount": video_data["viewCount"],
        "duration": video_data["duration"],
        "publishedTime": video_data["publishedTime"],
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "text": transcript_text,
    }

    # Save to file
    output_path = channel_dir / f"{video_data['videoId']}.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Fetch YouTube transcripts for Board of Directors RAG"
    )
    parser.add_argument(
        "--channels",
        type=Path,
        default=None,
        help="Path to channels.json config file (default: app/scripts/data/channels.json)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=30,
        help="Maximum videos to fetch per channel (default: 30)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Output directory for transcripts (default: app/scripts/data/transcripts)",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip videos that already have transcripts saved (for resuming interrupted runs)",
    )

    args = parser.parse_args()

    # Set default paths relative to script location
    script_dir = get_script_dir()

    channels_path = args.channels or script_dir / "data" / "channels.json"
    output_dir = args.output_dir or script_dir / "data" / "transcripts"

    # Validate paths
    if not channels_path.exists():
        print(f"❌ Channels config not found: {channels_path}")
        sys.exit(1)

    # Load channels
    print(f"📂 Loading channels from: {channels_path}")
    channels = load_channels(channels_path)
    print(f"   Found {len(channels)} channel(s)\n")

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    # Process each channel
    total_videos = 0
    total_transcripts = 0

    for i, channel in enumerate(channels, 1):
        channel_url = channel["channelUrl"]
        channel_name = channel["name"]
        channel_handle = get_channel_handle(channel_url)

        print(f"📺 [{i}/{len(channels)}] Fetching channel: {channel_name}")
        print(f"   URL: {channel_url}")

        # Fetch videos
        videos = fetch_channel_videos(channel_url, args.limit)
        print(f"   Found {len(videos)} videos (requested limit: {args.limit})")

        if not videos:
            print("   ⚠️  No videos found, skipping channel\n")
            continue

        # Fetch transcript for each video
        channel_transcripts = 0
        skipped_existing = 0

        for j, video in enumerate(videos, 1):
            video_id = video["videoId"]
            title = video["title"][:50] + "..." if len(video["title"]) > 50 else video["title"]

            print(f"   [{j}/{len(videos)}] {title}")

            # Check if transcript already exists
            existing_path = output_dir / channel_handle / f"{video_id}.json"
            if args.skip_existing and existing_path.exists():
                print(f"    ⏭️  Already exists, skipping")
                skipped_existing += 1
                channel_transcripts += 1
                continue

            # Fetch transcript
            transcript_text = fetch_transcript(video_id)

            if transcript_text:
                # Save to file
                output_path = save_transcript(
                    output_dir, channel_handle, channel_url, channel_name, video, transcript_text
                )
                print(f"    ✅ Saved: {output_path.name}")
                channel_transcripts += 1
            else:
                print(f"    ⏭️  Skipped (no transcript)")

        total_videos += len(videos)
        total_transcripts += channel_transcripts

        print(f"   📊 Channel complete: {channel_transcripts}/{len(videos)} transcripts", end="")
        if skipped_existing > 0:
            print(f" ({skipped_existing} already existed)")
        else:
            print(" saved\n")

    # Summary
    print("=" * 50)
    print("✅ Fetch complete!")
    print(f"   Channels processed: {len(channels)}")
    print(f"   Videos found: {total_videos}")
    print(f"   Transcripts saved: {total_transcripts}")
    print(f"   Output directory: {output_dir}")


if __name__ == "__main__":
    main()
