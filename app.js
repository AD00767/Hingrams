/* =========================================================
   HINGRAM — FRONTEND
   ========================================================= */

const SUPABASE_URL = "https://ipylukvdvttfvfftgpnm.supabase.co";
const SUPABASE_KEY = "sb_publishable_gHfQp9FqnMfEa9l_Lc69_w_XrPyRGCC";
const STORAGE_BUCKET = "hingram-media";

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let currentUser = null;
let currentProfile = null;
let viewedProfileId = null;
let feedOffset = 0;
const PAGE_SIZE = 10;
let currentCommentsPost = null;
let replyToCommentId = null;
let editingPostId = null;
let selectedImages = [];
let selectedAvatarFile = null;
let selectedCoverFile = null;
let signupEmail = "";
let signupDisplayName = "";
let verifiedSignupUser = false;
let toastTimer = null;

const REACTIONS = [
  { type: "like", label: "Thích", icon: "👍" },
  { type: "love", label: "Yêu thích", icon: "❤️" },
  { type: "care", label: "Thương thương", icon: "🥰" },
  { type: "haha", label: "Haha", icon: "😂" },
  { type: "wow", label: "Wow", icon: "😮" },
  { type: "sad", label: "Buồn", icon: "😢" },
  { type: "angry", label: "Phẫn nộ", icon: "😡" }
];

const DEFAULT_PLATFORMS = [
  "Facebook", "Instagram", "TikTok", "YouTube", "X", "Threads", "Discord", "Website"
];

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

function safeURL(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function avatarURL(profile) {
  return safeURL(profile?.avatar_url) ||
    "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#dddddd"/><circle cx="50" cy="36" r="19" fill="#999999"/><path d="M15 100c3-25 18-36 35-36s32 11 35 36" fill="#999999"/></svg>'
    );
}

function coverURL(profile) {
  return safeURL(profile?.cover_url) || "";
}

function showToast(message, duration = 3500) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

/* CUSTOM DIALOGS */
function showConfirmDialog(title, message) {
  return new Promise((resolve) => {
    $("#confirm-modal-title").textContent = title;
    $("#confirm-modal-message").textContent = message;
    showModal("confirm-modal");

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    function cleanup() {
      hideModal("confirm-modal");
      $("#confirm-modal-ok").removeEventListener("click", onOk);
      $("#confirm-modal-cancel").removeEventListener("click", onCancel);
    }

    $("#confirm-modal-ok").addEventListener("click", onOk);
    $("#confirm-modal-cancel").addEventListener("click", onCancel);
  });
}

function showPromptDialog(title, message, defaultValue = "") {
  return new Promise((resolve) => {
    $("#prompt-modal-title").textContent = title;
    $("#prompt-modal-message").textContent = message;
    $("#prompt-modal-input").value = defaultValue;
    showModal("prompt-modal");

    const onOk = () => {
      const val = $("#prompt-modal-input").value;
      cleanup();
      resolve(val);
    };
    const onCancel = () => { cleanup(); resolve(null); };

    function cleanup() {
      hideModal("prompt-modal");
      $("#prompt-modal-ok").removeEventListener("click", onOk);
      $("#prompt-modal-cancel").removeEventListener("click", onCancel);
    }

    $("#prompt-modal-ok").addEventListener("click", onOk);
    $("#prompt-modal-cancel").addEventListener("click", onCancel);
  });
}

function setBusy(button, busy, label = "Đang xử lý...") {
  if (!button) return;
  if (busy) {
    button.dataset.oldText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.oldText || button.textContent;
    button.disabled = false;
  }
}

function showModal(id) { $("#" + id)?.classList.remove("hidden"); }
function hideModal(id) { $("#" + id)?.classList.add("hidden"); }

function switchAuth(view) {
  $("#login-form").classList.toggle("hidden", view !== "login");
  $("#signup-form").classList.toggle("hidden", view !== "signup");
}

function showSignupStep(step) {
  [1, 2, 3].forEach(n => $("#signup-step-" + n).classList.toggle("hidden", n !== step));
}

function applyTheme(theme) {
  let resolved = theme;
  if (theme === "system") {
    resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = resolved;
}

function applyCurrentTheme() {
  applyTheme(currentProfile?.theme || "system");
}

function formatDate(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  return date.toLocaleString("vi-VN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

function setProfileImages() {
  const src = avatarURL(currentProfile);
  $("#top-avatar").src = src;
  $("#composer-avatar").src = src;
  $("#editor-avatar").src = src;
  $("#comment-avatar").src = src;
  $("#editor-name").textContent = currentProfile?.display_name || "Tài khoản";
}

function showApp() {
  $("#auth-screen").classList.add("hidden");
  $("#app-screen").classList.remove("hidden");
  setProfileImages();
  applyCurrentTheme();
}

function showAuth() {
  $("#app-screen").classList.add("hidden");
  $("#auth-screen").classList.remove("hidden");
}

async function getProfile(userId) {
  const { data, error } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureProfile() {
  if (!currentUser) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const profile = await getProfile(currentUser.id);
    if (profile) {
      currentProfile = profile;
      return profile;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("Không tìm thấy hồ sơ tài khoản.");
}

async function handleAuthState(session) {
  currentUser = session?.user || null;
  if (!currentUser) {
    currentProfile = null;
    showAuth();
    return;
  }
  try {
    await ensureProfile();
    showApp();
    await loadFeed(true);
  } catch (error) {
    showToast(error.message || "Không thể tải hồ sơ.");
  }
}

/* AUTH HANDLERS */
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.submitter;
  setBusy(button, true, "Đang đăng nhập...");
  try {
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    await ensureProfile();
    showApp();
    await loadFeed(true);
    showToast("Đăng nhập thành công.");
  } catch (err) {
    showToast(err.message || "Đăng nhập thất bại.");
  } finally {
    setBusy(button, false);
  }
});

async function sendSignupOTP() {
  signupDisplayName = $("#signup-name").value.trim();
  signupEmail = $("#signup-email").value.trim().toLowerCase();
  if (signupDisplayName.length < 2) return showToast("Tên hiển thị cần ít nhất 2 ký tự.");
  if (!signupEmail || !$("#signup-email").checkValidity()) return showToast("Email không hợp lệ.");

  const button = $("#send-otp-btn");
  setBusy(button, true, "Đang gửi mã...");
  try {
    const { error } = await db.auth.signInWithOtp({
      email: signupEmail,
      options: { shouldCreateUser: true, data: { display_name: signupDisplayName } }
    });
    if (error) throw error;
    $("#signup-otp").value = "";
    showSignupStep(2);
    showToast("Đã gửi mã xác minh đến email.");
  } catch (err) {
    showToast(err.message || "Không thể gửi mã xác minh.");
  } finally {
    setBusy(button, false);
  }
}

$("#send-otp-btn").addEventListener("click", sendSignupOTP);
$("#resend-otp-btn").addEventListener("click", sendSignupOTP);

$("#verify-otp-btn").addEventListener("click", async () => {
  const token = $("#signup-otp").value.trim();
  if (!/^\d{8}$/.test(token)) return showToast("Mã xác minh phải có 8 chữ số.");

  const button = $("#verify-otp-btn");
  setBusy(button, true, "Đang xác minh...");
  try {
    const { data, error } = await db.auth.verifyOtp({ email: signupEmail, token, type: "email" });
    if (error) throw error;
    currentUser = data.user;
    verifiedSignupUser = true;
    await db.auth.updateUser({ data: { display_name: signupDisplayName } });
    showSignupStep(3);
    showToast("Email đã được xác minh.");
  } catch (err) {
    showToast(err.message || "Mã không hợp lệ.");
  } finally {
    setBusy(button, false);
  }
});

$("#signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!verifiedSignupUser || !currentUser) return showToast("Hãy xác minh email trước.");
  const password = $("#signup-password").value;
  if (password !== $("#signup-confirm").value) return showToast("Mật khẩu không trùng khớp.");

  const button = e.submitter;
  setBusy(button, true, "Đang hoàn tất...");
  try {
    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;
    await ensureProfile();
    showApp();
    await loadFeed(true);
    showToast("Tài khoản đã được tạo.");
  } catch (err) {
    showToast(err.message);
  } finally {
    setBusy(button, false);
  }
});

$$("[data-show-auth]").forEach(b => b.addEventListener("click", () => {
  switchAuth(b.dataset.showAuth);
  if (b.dataset.showAuth === "signup") showSignupStep(1);
}));

$("#logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  hideModal("settings-modal");
  currentUser = null;
  currentProfile = null;
  showAuth();
  showToast("Đã đăng xuất.");
});

db.auth.onAuthStateChange((_e, session) => {
  setTimeout(() => handleAuthState(session), 0);
});

/* NAVIGATION */
function showView(view) {
  $("#feed-view").classList.toggle("hidden", view !== "feed");
  $("#profile-view").classList.toggle("hidden", view !== "profile");
  $("#nav-home").classList.toggle("active", view === "feed");
  $("#nav-profile").classList.toggle("active", view === "profile");

  if (view === "profile") viewUserProfile(currentUser.id);
}

$("#home-btn").addEventListener("click", () => showView("feed"));
$("#nav-home").addEventListener("click", () => showView("feed"));
$("#nav-profile").addEventListener("click", () => showView("profile"));
$("#profile-btn").addEventListener("click", () => {
  renderSettingsProfile();
  showModal("settings-modal");
});
$("#settings-edit-profile").addEventListener("click", () => {
  hideModal("settings-modal");
  openProfileEditor();
});

/* FOOTER LINKS */
$("#link-privacy")?.addEventListener("click", (e) => { e.preventDefault(); showToast("Trang Bảo mật của Hingram."); });
$("#link-terms")?.addEventListener("click", (e) => { e.preventDefault(); showToast("Trang Điều khoản sử dụng."); });
$("#link-contact")?.addEventListener("click", (e) => { e.preventDefault(); showToast("Liên hệ: support@hingram.com"); });

/* FEED & POSTS */
async function loadFeed(reset = false) {
  if (!currentUser) return;
  if (reset) {
    feedOffset = 0;
    $("#feed-list").innerHTML = '<div class="loading">Đang tải bài viết...</div>';
  }
  const button = $("#load-more-btn");
  button.disabled = true;

  try {
    const { data: posts, error } = await db.from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .range(feedOffset, feedOffset + PAGE_SIZE - 1);
    if (error) throw error;

    if (reset) $("#feed-list").innerHTML = "";
    if (!posts.length && feedOffset === 0) {
      $("#feed-list").innerHTML = '<div class="empty-state">Chưa có bài viết nào.</div>';
    } else {
      await renderPosts(posts, $("#feed-list"));
    }
    feedOffset += posts.length;
    button.classList.toggle("hidden", posts.length < PAGE_SIZE);
  } catch (err) {
    showToast("Lỗi tải bảng tin: " + err.message);
  } finally {
    button.disabled = false;
  }
}

$("#refresh-feed").addEventListener("click", () => loadFeed(true));
$("#load-more-btn").addEventListener("click", () => loadFeed(false));

async function renderPosts(posts, container) {
  if (!posts.length) return;
  const authorIds = [...new Set(posts.map(p => p.author_id))];
  const postIds = posts.map(p => p.id);

  const [profileResult, reactionResult, commentResult] = await Promise.all([
    db.from("profiles").select("id,display_name,avatar_url,role").in("id", authorIds),
    db.from("reactions").select("post_id,user_id,reaction_type").in("post_id", postIds),
    db.from("comments").select("post_id,id").in("post_id", postIds)
  ]);

  const profiles = Object.fromEntries((profileResult.data || []).map(p => [p.id, p]));
  const reactionsByPost = {};
  (reactionResult.data || []).forEach(r => (reactionsByPost[r.post_id] ||= []).push(r));
  const commentCounts = {};
  (commentResult.data || []).forEach(c => commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1);

  for (const post of posts) {
    const author = profiles[post.author_id] || { display_name: "Tài khoản", avatar_url: null };
    const reactions = reactionsByPost[post.id] || [];
    const myReaction = reactions.find(r => r.user_id === currentUser.id);

    const imageHTML = (post.image_urls || []).map(url => {
      const safe = safeURL(url);
      return safe ? `<img src="${escapeHTML(safe)}" alt="Ảnh" loading="lazy">` : "";
    }).join("");

    const isOwner = post.author_id === currentUser.id;
    const isAdmin = currentProfile?.role === "admin";
    const canManage = isOwner || isAdmin;

    const card = document.createElement("article");
    card.className = "post-card";
    card.dataset.postId = post.id;

    card.innerHTML = `
      <div class="post-head">
        <img class="avatar clickable-author" data-author-id="${post.author_id}" src="${escapeHTML(avatarURL(author))}" alt="">
        <div class="post-head-info">
          <strong class="clickable-author" data-author-id="${post.author_id}">${escapeHTML(author.display_name)}${author.role === "admin" ? " · Quản trị viên" : ""}</strong>
          <div class="post-meta">${escapeHTML(formatDate(post.created_at))}${post.updated_at !== post.created_at ? " · Đã chỉnh sửa" : ""}</div>
        </div>
        <button class="post-menu" data-action="post-menu" title="Tùy chọn">⋯</button>
      </div>
      <div class="post-body">${parseMarkdown(post.content || "")}</div>
      ${imageHTML ? `<div class="post-images">${imageHTML}</div>` : ""}
      <div class="post-stats">
        <span>${reactions.length} lượt bày tỏ cảm xúc</span>
        <span>${commentCounts[post.id] || 0} bình luận</span>
      </div>
      <div class="post-actions">
        <button data-action="react" class="${myReaction ? "reacted" : ""}">${myReaction ? "❤️ Cảm xúc" : "👍 Thích"}</button>
        <button data-action="comments">▢ Bình luận</button>
        <button data-action="share">↗ Chia sẻ</button>
      </div>
      <div class="reaction-picker hidden">
        ${REACTIONS.map(r => `<button data-reaction="${r.type}">${r.icon}</button>`).join("")}
      </div>
      <div class="post-menu-panel hidden">
        ${canManage ? `<button data-action="edit-post">Chỉnh sửa bài viết</button>` : ""}
        ${canManage ? `<button data-action="toggle-comments">${post.comments_enabled ? "Tắt tính năng bình luận" : "Bật tính năng bình luận"}</button>` : ""}
        ${canManage ? `<button data-action="delete-post" class="danger-text">Xóa bài viết</button>` : ""}
        <button data-action="copy-link">Sao chép liên kết</button>
      </div>
    `;
    container.appendChild(card);
  }
}

function parseMarkdown(text) {
  let esc = escapeHTML(text);
  esc = esc.replace(/^### (.*$)/gim, '### $1')
           .replace(/^## (.*$)/gim, '## $1')
           .replace(/^# (.*$)/gim, '# $1')
           .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
           .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
           .replace(/\*(.*?)\*/g, '<i>$1</i>')
           .replace(/\n/g, '<br>');
  return esc;
}

/* POST EDITOR & MARKDOWN */
function openPostEditor(post = null) {
  if (!currentUser) return showToast("Hãy đăng nhập trước.");
  selectedImages = [];
  $("#image-preview").innerHTML = "";
  $("#post-images").value = "";
  $("#post-content").value = "";
  $("#comments-enabled").checked = true;

  editingPostId = post?.id || null;
  $("#post-modal-title").textContent = post ? "Chỉnh sửa bài viết" : "Tạo bài viết";
  $("#publish-post-btn").textContent = post ? "Lưu" : "Đăng";

  if (post) {
    $("#post-content").value = post.content || "";
    $("#comments-enabled").checked = !!post.comments_enabled;
    selectedImages = (post.image_urls || []).map(url => ({ existing: true, url }));
    renderImagePreview();
  }

  setProfileImages();
  showModal("post-modal");
}

$("#new-post-btn").addEventListener("click", () => openPostEditor());
$("#composer-launch").addEventListener("click", () => openPostEditor());

$$("[data-md]").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = $("#post-content");
    const tag = btn.dataset.md;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const val = input.value;

    if (tag.endsWith(" ")) {
      input.value = val.substring(0, start) + tag + val.substring(start);
    } else {
      const sel = val.substring(start, end);
      input.value = val.substring(0, start) + tag + sel + tag + val.substring(end);
    }
    input.focus();
  });
});

$("#post-images").addEventListener("change", (e) => {
  const files = [...e.target.files];
  for (const file of files) {
    if (selectedImages.length >= 8) break;
    selectedImages.push({ file });
  }
  e.target.value = "";
  renderImagePreview();
});

function renderImagePreview() {
  $("#image-preview").innerHTML = selectedImages.map((item, idx) => {
    const src = item.file ? URL.createObjectURL(item.file) : item.url;
    return `<div class="preview-item"><img src="${escapeHTML(src)}" alt=""><button type="button" data-remove-image="${idx}">×</button></div>`;
  }).join("");
}

$("#image-preview").addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove-image]");
  if (!b) return;
  selectedImages.splice(Number(b.dataset.removeImage), 1);
  renderImagePreview();
});

async function uploadImage(file, folder) {
  const ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${currentUser.id}/${folder}/${crypto.randomUUID()}.${ext || "jpg"}`;
  const { data, error } = await db.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return db.storage.from(STORAGE_BUCKET).getPublicUrl(data.path).data.publicUrl;
}

$("#publish-post-btn").addEventListener("click", async () => {
  const button = $("#publish-post-btn");
  const content = $("#post-content").value.trim();

  if (!content && selectedImages.length === 0) {
    return showToast("Hãy nhập nội dung hoặc chọn ảnh.");
  }

  setBusy(button, true, "Đang xử lý...");
  try {
    const imageURLs = selectedImages.filter(x => x.existing).map(x => x.url);
    for (const item of selectedImages) {
      if (item.file) imageURLs.push(await uploadImage(item.file, "posts"));
    }

    if (editingPostId) {
      const { error } = await db.from("posts").update({
        content, image_urls: imageURLs, comments_enabled: $("#comments-enabled").checked
      }).eq("id", editingPostId);
      if (error) throw error;
    } else {
      const { error } = await db.from("posts").insert({
        author_id: currentUser.id, content, image_urls: imageURLs, comments_enabled: $("#comments-enabled").checked
      });
      if (error) throw error;
    }

    hideModal("post-modal");
    await loadFeed(true);
    showToast(editingPostId ? "Đã cập nhật bài viết." : "Đã đăng bài viết.");
    editingPostId = null;
  } catch (err) {
    showToast(err.message);
  } finally {
    setBusy(button, false);
  }
});

/* POST ACTIONS & AUTHOR CLICK */
document.addEventListener("click", async (e) => {
  const authorEl = e.target.closest(".clickable-author");
  if (authorEl) {
    const id = authorEl.dataset.authorId;
    if (id) viewUserProfile(id);
    return;
  }

  const card = e.target.closest("[data-post-id]");
  if (!card) return;
  const postId = card.dataset.postId;
  const btn = e.target.closest("[data-action], [data-reaction]");
  if (!btn) return;

  const action = btn.dataset.action;

  try {
    if (action === "post-menu") {
      card.querySelector(".post-menu-panel")?.classList.toggle("hidden");
    } else if (action === "react") {
      card.querySelector(".reaction-picker").classList.toggle("hidden");
    } else if (btn.dataset.reaction) {
      await toggleReaction(postId, btn.dataset.reaction);
      await loadFeed(true);
    } else if (action === "comments") {
      openComments(postId);
    } else if (action === "share" || action === "copy-link") {
      const link = `${location.origin}${location.pathname}#post-${postId}`;
      await navigator.clipboard.writeText(link);
      showToast("Đã sao chép liên kết bài viết.");
      card.querySelector(".post-menu-panel")?.classList.add("hidden");
    } else if (action === "edit-post") {
      const { data } = await db.from("posts").select("*").eq("id", postId).single();
      openPostEditor(data);
    } else if (action === "toggle-comments") {
      const { data } = await db.from("posts").select("comments_enabled").eq("id", postId).single();
      await db.from("posts").update({ comments_enabled: !data.comments_enabled }).eq("id", postId);
      await loadFeed(true);
      showToast(data.comments_enabled ? "Đã tắt bình luận." : "Đã bật bình luận.");
    } else if (action === "delete-post") {
      const ok = await showConfirmDialog("Xóa bài viết", "Bạn có chắc chắn muốn xóa bài viết này không?");
      if (ok) {
        await db.from("posts").delete().eq("id", postId);
        await loadFeed(true);
        showToast("Đã xóa bài viết.");
      }
    }
  } catch (err) {
    showToast(err.message);
  }
});

async function toggleReaction(postId, type) {
  const { data: existing } = await db.from("reactions").select("id,reaction_type").eq("post_id", postId).eq("user_id", currentUser.id).maybeSingle();
  if (existing?.reaction_type === type) {
    await db.from("reactions").delete().eq("id", existing.id);
  } else if (existing) {
    await db.from("reactions").update({ reaction_type: type }).eq("id", existing.id);
  } else {
    await db.from("reactions").insert({ post_id: postId, user_id: currentUser.id, reaction_type: type });
  }
}

/* COMMENT TREE & NESTED COMMENTS */
async function openComments(postId) {
  const { data: post } = await db.from("posts").select("id,comments_enabled").eq("id", postId).single();
  currentCommentsPost = post;
  replyToCommentId = null;
  $("#reply-indicator").classList.add("hidden");

  $("#comment-input").disabled = !post.comments_enabled;
  $("#comment-form").querySelector("button").disabled = !post.comments_enabled;
  $("#comment-input").placeholder = post.comments_enabled ? "Viết bình luận..." : "Bài viết đã tắt bình luận";

  await loadComments();
  showModal("comments-modal");
}

async function loadComments() {
  if (!currentCommentsPost) return;
  const { data: comments, error } = await db.from("comments")
    .select("*")
    .eq("post_id", currentCommentsPost.id)
    .order("created_at", { ascending: true });

  if (error) return showToast(error.message);

  const authorIds = [...new Set((comments || []).map(c => c.author_id))];
  let profiles = {};
  if (authorIds.length) {
    const res = await db.from("profiles").select("id,display_name,avatar_url").in("id", authorIds);
    profiles = Object.fromEntries((res.data || []).map(p => [p.id, p]));
  }

  const rootComments = (comments || []).filter(c => !c.parent_id);
  const replies = (comments || []).filter(c => c.parent_id);

  $("#comments-list").innerHTML = rootComments.map(c => renderCommentTree(c, replies, profiles)).join("") || '<div class="empty-state">Chưa có bình luận nào.</div>';
}

function renderCommentTree(comment, allReplies, profiles) {
  const author = profiles[comment.author_id] || { display_name: "Tài khoản" };
  const childReplies = allReplies.filter(r => r.parent_id === comment.id);
  const isOwner = comment.author_id === currentUser.id || currentProfile?.role === "admin";

  return `
    <div class="comment-item" data-comment-id="${comment.id}">
      <div class="comment-row">
        <img class="avatar tiny" src="${escapeHTML(avatarURL(author))}" alt="">
        <div class="comment-bubble">
          <strong>${escapeHTML(author.display_name)}</strong>
          <p>${escapeHTML(comment.content)}</p>
          <div class="comment-tools">
            <span>${escapeHTML(formatDate(comment.created_at))}</span>
            <button data-comment-action="reply" data-author="${escapeHTML(author.display_name)}">Trả lời</button>
            <button class="comment-menu-btn" data-comment-action="menu">⋯</button>
          </div>
          <div class="comment-menu-panel hidden">
            ${isOwner ? `<button data-comment-action="edit">Chỉnh sửa</button><button data-comment-action="delete" class="danger-text">Xóa</button>` : ""}
            <button data-comment-action="react">Bày tỏ cảm xúc</button>
            <button data-comment-action="reply" data-author="${escapeHTML(author.display_name)}">Trả lời</button>
            <button data-comment-action="copy">Sao chép</button>
          </div>
        </div>
      </div>
      ${childReplies.length ? `<div class="replies-tree">${childReplies.map(r => renderCommentTree(r, allReplies, profiles)).join("")}</div>` : ""}
    </div>
  `;
}

$("#comment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = $("#comment-input").value.trim();
  if (!content || !currentCommentsPost) return;

  const btn = e.submitter;
  setBusy(btn, true, "Đang gửi...");
  try {
    const { error } = await db.from("comments").insert({
      post_id: currentCommentsPost.id,
      author_id: currentUser.id,
      parent_id: replyToCommentId,
      content
    });
    if (error) throw error;
    $("#comment-input").value = "";
    replyToCommentId = null;
    $("#reply-indicator").classList.add("hidden");
    await loadComments();
  } catch (err) {
    showToast("Không thể gửi bình luận: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

$("#cancel-reply-btn").addEventListener("click", () => {
  replyToCommentId = null;
  $("#reply-indicator").classList.add("hidden");
});

$("#comments-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-comment-action]");
  if (!btn) return;

  const row = btn.closest("[data-comment-id]");
  const commentId = row.dataset.commentId;
  const action = btn.dataset.commentAction;

  if (action === "menu") {
    row.querySelector(".comment-menu-panel")?.classList.toggle("hidden");
  } else if (action === "reply") {
    replyToCommentId = commentId;
    $("#reply-indicator-text").textContent = `Đang trả lời ${btn.dataset.author || "bình luận"}...`;
    $("#reply-indicator").classList.remove("hidden");
    $("#comment-input").focus();
  } else if (action === "copy") {
    const txt = row.querySelector("p")?.textContent || "";
    await navigator.clipboard.writeText(txt);
    showToast("Đã sao chép nội dung.");
  } else if (action === "edit") {
    const currentTxt = row.querySelector("p")?.textContent || "";
    const newTxt = await showPromptDialog("Chỉnh sửa bình luận", "Nhập nội dung mới:", currentTxt);
    if (newTxt && newTxt.trim()) {
      await db.from("comments").update({ content: newTxt.trim() }).eq("id", commentId);
      await loadComments();
      showToast("Đã cập nhật bình luận.");
    }
  } else if (action === "delete") {
    const ok = await showConfirmDialog("Xóa bình luận", "Bạn có chắc muốn xóa bình luận này?");
    if (ok) {
      await db.from("comments").delete().eq("id", commentId);
      await loadComments();
      showToast("Đã xóa bình luận.");
    }
  } else if (action === "react") {
    showToast("Đã gửi cảm xúc.");
  }
});

/* PROFILE VIEW & USER PROFILES */
async function viewUserProfile(userId) {
  viewedProfileId = userId;
  showView("profile");
  $("#profile-posts").innerHTML = '<div class="loading">Đang tải...</div>';

  try {
    const profile = await getProfile(userId);
    const isSelf = userId === currentUser.id;

    const { data: links } = await db.from("social_links").select("platform,url").eq("profile_id", userId);
    const linksHTML = (links || []).map(l => {
      const url = safeURL(l.url);
      return url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(l.platform)}</a>` : "";
    }).join("");

    $("#profile-panel").innerHTML = `
      ${coverURL(profile) ? `<img class="profile-cover" src="${escapeHTML(coverURL(profile))}" alt="Ảnh bìa">` : `<div class="profile-cover"></div>`}
      <div class="profile-header-content">
        <div class="profile-top-controls">
          <button class="icon-button" id="share-profile-btn" title="Chia sẻ trang cá nhân">↗</button>
          ${isSelf ? `<button class="btn secondary" id="profile-edit-btn">Chỉnh sửa</button>` : ""}
        </div>
        <div class="profile-avatar-overlay">
          <img class="avatar huge" src="${escapeHTML(avatarURL(profile))}" alt="">
        </div>
        <h2>${escapeHTML(profile.display_name || "Người dùng")}</h2>
        <div class="profile-bio">${escapeHTML(profile.bio || "Chưa có tiểu sử.")}</div>
        <div class="profile-links">${linksHTML}</div>
      </div>
    `;

    $("#share-profile-btn").addEventListener("click", async () => {
      const link = `${location.origin}${location.pathname}#profile-${userId}`;
      await navigator.clipboard.writeText(link);
      showToast("Đã sao chép liên kết trang cá nhân.");
    });

    if (isSelf) {
      $("#profile-edit-btn")?.addEventListener("click", openProfileEditor);
    }

    const { data: posts } = await db.from("posts").select("*").eq("author_id", userId).order("created_at", { ascending: false });
    $("#profile-posts").innerHTML = "";
    if (!posts || !posts.length) {
      $("#profile-posts").innerHTML = '<div class="empty-state">Chưa có bài viết nào.</div>';
    } else {
      await renderPosts(posts, $("#profile-posts"));
    }
  } catch (err) {
    showToast("Không thể tải trang cá nhân: " + err.message);
  }
}

function renderSettingsProfile() {
  $("#settings-profile").innerHTML = `
    <img class="avatar huge" src="${escapeHTML(avatarURL(currentProfile))}" alt="">
    <h3>${escapeHTML(currentProfile?.display_name || "Tài khoản")}</h3>
    <p class="muted small-text">${escapeHTML(currentUser?.email || "")}</p>
  `;
}

/* PROFILE EDITOR & SOCIAL LINKS DYNAMIC ADDITION */
async function openProfileEditor() {
  if (!currentUser) return;
  await ensureProfile();

  $("#edit-display-name").value = currentProfile.display_name || "";
  $("#edit-bio").value = currentProfile.bio || "";
  $("#edit-theme").value = currentProfile.theme || "system";
  $("#edit-avatar-preview").src = avatarURL(currentProfile);
  $("#edit-cover-preview").src = coverURL(currentProfile);
  selectedAvatarFile = null;
  selectedCoverFile = null;

  const { data: links } = await db.from("social_links").select("platform,url").eq("profile_id", currentUser.id);
  $("#social-links-list").innerHTML = "";

  (links || []).forEach(l => addSocialLinkRow(l.platform, l.url));

  hideModal("settings-modal");
  showModal("profile-modal");
}

$("#toggle-social-editor-btn").addEventListener("click", () => {
  $("#social-links-container").classList.toggle("hidden");
});

function addSocialLinkRow(platform = "Facebook", url = "") {
  const row = document.createElement("div");
  row.className = "social-row-custom";
  row.innerHTML = `
    <input class="social-name-input" value="${escapeHTML(platform)}" placeholder="Tên mạng">
    <input class="social-url-input" type="url" value="${escapeHTML(url)}" placeholder="https://...">
    <button type="button" class="remove-social-btn">×</button>
  `;
  row.querySelector(".remove-social-btn").addEventListener("click", () => row.remove());
  $("#social-links-list").appendChild(row);
}

$("#add-custom-social-btn").addEventListener("click", () => addSocialLinkRow("", ""));

$("#avatar-file").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) {
    selectedAvatarFile = file;
    $("#edit-avatar-preview").src = URL.createObjectURL(file);
  }
});

$("#cover-file").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) {
    selectedCoverFile = file;
    $("#edit-cover-preview").src = URL.createObjectURL(file);
  }
});

$("#save-profile-btn").addEventListener("click", async () => {
  const button = $("#save-profile-btn");
  const displayName = $("#edit-display-name").value.trim();
  const bio = $("#edit-bio").value.trim();
  const theme = $("#edit-theme").value;

  if (displayName.length < 2) return showToast("Tên hiển thị cần ít nhất 2 ký tự.");

  setBusy(button, true, "Đang lưu...");
  try {
    let avatar_url = currentProfile.avatar_url;
    let cover_url = currentProfile.cover_url;

    if (selectedAvatarFile) avatar_url = await uploadImage(selectedAvatarFile, "avatars");
    if (selectedCoverFile) cover_url = await uploadImage(selectedCoverFile, "covers");

    await db.from("profiles").update({ display_name: displayName, bio, theme, avatar_url, cover_url }).eq("id", currentUser.id);

    await db.from("social_links").delete().eq("profile_id", currentUser.id);
    const rows = $$(".social-row-custom");
    for (const r of rows) {
      const pName = r.querySelector(".social-name-input").value.trim();
      const pUrl = r.querySelector(".social-url-input").value.trim();
      if (pName && pUrl) {
        const safe = safeURL(pUrl);
        if (safe) {
          await db.from("social_links").insert({ profile_id: currentUser.id, platform: pName, url: safe });
        }
      }
    }

    await ensureProfile();
    setProfileImages();
    applyCurrentTheme();
    hideModal("profile-modal");
    if (viewedProfileId === currentUser.id) viewUserProfile(currentUser.id);
    showToast("Đã lưu hồ sơ.");
  } catch (err) {
    showToast("Lỗi lưu hồ sơ: " + err.message);
  } finally {
    setBusy(button, false);
  }
});

$$("[data-close]").forEach(b => b.addEventListener("click", () => hideModal(b.dataset.close)));
$$(".modal").forEach(m => m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); }));

async function initialize() {
  if (SUPABASE_URL.includes("YOUR_SUPABASE") || SUPABASE_KEY.includes("YOUR_SUPABASE")) {
    showAuth();
    return showToast("Hãy nhập cấu hình Supabase URL và Publishable Key.");
  }
  const { data } = await db.auth.getSession();
  await handleAuthState(data.session);
}

initialize();
