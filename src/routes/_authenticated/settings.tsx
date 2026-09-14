import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Predikt" }] }),
  component: Settings,
});

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

function Settings() {
  const { user, profile, refreshProfile } = useAuth();
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [savingBio, setSavingBio] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [historyPublic, setHistoryPublic] = useState<boolean>(
    (profile as any)?.trading_history_public ?? true,
  );
  const [attributeSuggestions, setAttributeSuggestions] = useState<boolean>(
    (profile as any)?.attribute_suggestions_publicly ?? true,
  );
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAttributeSuggestions((profile as any)?.attribute_suggestions_publicly ?? true);
  }, [(profile as any)?.attribute_suggestions_publicly]);

  const { data: blocked, refetch: refetchBlocked } = useQuery({
    queryKey: ["blocked-users", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("friendships")
        .select(
          "id, requester_id, addressee_id, requester:public_profiles!friendships_requester_id_fkey(id, username, avatar_url), addressee:public_profiles!friendships_addressee_id_fkey(id, username, avatar_url)",
        )
        .eq("status", "blocked")
        .eq("blocked_by", user!.id);
      type Row = {
        id: string;
        requester_id: string;
        requester: { id: string; username: string; avatar_url: string | null } | null;
        addressee: { id: string; username: string; avatar_url: string | null } | null;
      };
      return ((data as Row[] | null) ?? [])
        .map((r) => ({
          id: r.id,
          other: r.requester_id === user!.id ? r.addressee : r.requester,
        }))
        .filter((r): r is { id: string; other: { id: string; username: string; avatar_url: string | null } } =>
          !!r.other,
        );
    },
  });

  const unblock = async (otherId: string) => {
    const { error } = await (supabase as any).rpc("unblock_user", { _user_id: otherId });
    if (error) return toast.error(error.message);
    toast.success("Unblocked");
    refetchBlocked();
  };

  // Default for future suggestions only; markets already live keep their setting.
  const toggleAttribution = async (next: boolean) => {
    if (!user) return;
    setAttributeSuggestions(next);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ attribute_suggestions_publicly: next })
      .eq("id", user.id);
    if (error) {
      setAttributeSuggestions(!next);
      return toast.error(error.message);
    }
    toast.success(
      next
        ? "New suggestions will show your username"
        : "New suggestions won't show your username",
    );
    refreshProfile();
  };

  useEffect(() => {
    setBio(profile?.bio ?? "");
  }, [profile?.bio]);

  useEffect(() => {
    setHistoryPublic((profile as any)?.trading_history_public ?? true);
  }, [(profile as any)?.trading_history_public]);

  // Persists the moment it's flipped; reverts the switch if the write fails.
  const toggleHistory = async (next: boolean) => {
    if (!user) return;
    setHistoryPublic(next);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ trading_history_public: next })
      .eq("id", user.id);
    if (error) {
      setHistoryPublic(!next);
      return toast.error(error.message);
    }
    toast.success(next ? "Trading history is public" : "Trading history is private");
    refreshProfile();
  };

  const { data: friendCount } = useQuery({
    queryKey: ["friend-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("friendships" as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted");
      return count ?? 0;
    },
  });

  const saveBio = async () => {
    if (!user) return;
    setSavingBio(true);
    const { error } = await supabase
      .from("profiles")
      .update({ bio: bio.trim() || null })
      .eq("id", user.id);
    setSavingBio(false);
    if (error) return toast.error(error.message);
    toast.success("Bio updated");
    refreshProfile();
  };

  const resizeToSquare = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        const target = Math.min(512, size);
        const canvas = document.createElement("canvas");
        canvas.width = target;
        canvas.height = target;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, sx, sy, size, size, 0, 0, target, target);
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Encoding failed"))),
          "image/webp",
          0.9,
        );
      };
      img.onerror = () => reject(new Error("Invalid image"));
      img.src = URL.createObjectURL(file);
    });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    if (!ALLOWED.includes(file.type)) {
      toast.error("Only JPG, PNG, or WebP images are allowed");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 5 MB or smaller");
      return;
    }

    try {
      setUploading(true);
      const blob = await resizeToSquare(file);
      const path = `${user.id}/avatar-${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/webp", upsert: true });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (sErr) throw sErr;

      const { error: pErr } = await supabase
        .from("profiles")
        .update({ avatar_url: signed.signedUrl })
        .eq("id", user.id);
      if (pErr) throw pErr;

      toast.success("Avatar updated");
      refreshProfile();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <Header />
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <h1 className="font-display text-3xl font-bold">Settings</h1>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold mb-4">Profile picture</h2>
          <div className="flex items-center gap-5">
            <UserAvatar
              username={profile?.username}
              avatarUrl={profile?.avatar_url}
              userId={user?.id}
              size="xl"
              showPresence={false}
            />
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFile}
                className="hidden"
              />
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                variant="secondary"
              >
                {uploading ? (
                  <>
                    <Loader2 className="animate-spin" size={14} /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload size={14} /> Upload image
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                JPG, PNG, or WebP. Max 5 MB. Auto-cropped to a square.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold">Bio</h2>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {bio.length}/280
            </span>
          </div>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 280))}
            placeholder="A short bio shown on your public profile…"
            rows={3}
            className="mb-3"
          />
          <Button
            size="sm"
            onClick={saveBio}
            disabled={savingBio || bio === (profile?.bio ?? "")}
          >
            {savingBio ? "Saving…" : "Save"}
          </Button>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold mb-4">Privacy</h2>
          <div className="flex items-start justify-between gap-5">
            <div>
              <label htmlFor="history-public" className="text-sm font-medium">
                Make my trading history public
              </label>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-md">
                When this is on, any signed-in user can see your full trade history —
                what you wagered, when, on which markets and at what price, plus how
                those markets turned out — along with your current open positions, on
                your profile and in each market's activity feed. Turn it off and only
                you can see them. Your rank and net worth stay on the leaderboard
                either way.
              </p>
            </div>
            <Switch
              id="history-public"
              checked={historyPublic}
              onCheckedChange={toggleHistory}
            />
          </div>

          <div className="flex items-start justify-between gap-5 mt-6 pt-6 border-t border-border">
            <div>
              <label htmlFor="attribute-suggestions" className="text-sm font-medium">
                Show my username on markets I suggest
              </label>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-md">
                When this is on, markets created from your suggestions show
                "Suggested by @{profile?.username}". This sets the default for
                suggestions you send from now on — it doesn't change markets that
                are already live. You can change those one by one from your
                suggestions list.
              </p>
            </div>
            <Switch
              id="attribute-suggestions"
              checked={attributeSuggestions}
              onCheckedChange={toggleAttribution}
            />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold mb-2">Blocked members</h2>
          <p className="text-xs text-muted-foreground mb-4 max-w-md">
            Blocked members can't send you friend requests, and neither of you appears
            in the other's member search. Unblocking restores that.
          </p>
          {(blocked ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven't blocked anyone.</p>
          ) : (
            <div className="divide-y divide-border">
              {(blocked ?? []).map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar
                      username={b.other.username}
                      avatarUrl={b.other.avatar_url}
                      userId={b.other.id}
                      size="md"
                    />
                    <span className="truncate text-sm">@{b.other.username}</span>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => unblock(b.other.id)}>
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-lg font-semibold mb-2">Social</h2>
          <p className="text-sm text-muted-foreground">
            You have <span className="text-foreground font-semibold">{friendCount ?? 0}</span>{" "}
            friend{friendCount === 1 ? "" : "s"}.
          </p>
        </section>
      </div>
    </div>
  );
}
