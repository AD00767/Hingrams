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

// --- STATE VARIABLES ---
let currentUser = null;
let currentProfile = null;
let viewingProfileId = null;
let feedOffset = 0;
const PAGE_SIZE = 10;
let currentCommentsPost = null;
let replyingToCommentId = null;
let editingPostId = null;
let selectedImages = [];
let selectedAvatarFile = null;
let selectedCoverFile = null;
let currentSocialLinks = [];
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

// ================= UTILITIES =================

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function safeURL(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function avatarURL(profile) {
  return safeURL(profile?.avatar_url) ||
    "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#dddddd"/><circle cx="50" cy="36" r="19" fill="#999999"/><path d="M15 100c3-25 18-36 35-36s32 11 35 36" fill="#999999"/></svg>');
}

function coverURL(profile) { return safeURL(profile?.cover_url) || ""; }

function showToast(message, duration = 3500) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
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

function formatDate(dateValue) {
  if (!dateValue) return "";
  return new Date(dateValue).toLocaleString("vi-VN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function applyTheme(theme) {
  let resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
}

// === CUSTOM DIALOG ===
function showCustomDialog(title, message, isPrompt = false, defaultValue = "") {
  return new Promise((resolve) => {
    $("#dialog-title").textContent = title;
    $("#dialog-message").textContent = message;
    const input = $("#dialog-input");
    input.classList.toggle("hidden", !isPrompt);
    if (isPrompt) {
      input.value = defaultValue;
      setTimeout(() => input.focus(), 100);
    }
    showModal("custom-dialog");

    const cleanup = () => {
      hideModal("custom-dialog");
      $("#dialog-cancel-btn").onclick = null;
      $("#dialog-confirm-btn").onclick = null;
    };

    $("#dialog-cancel-btn").onclick = () => { cleanup(); resolve(null); };
    $("#dialog-confirm-btn").onclick = () => {
      const result = isPrompt ? input.value : true;
      cleanup(); resolve(result);
    };
  });
}

// ================= AUTHENTICATION & INIT =================

function setProfileImages() {
  const src = avatarURL(currentProfile);
  if ($("#top-avatar")) $("#top-avatar").src = src;
  if ($("#composer-avatar")) $("#composer-avatar").src = src;
  if ($("#editor-avatar")) $("#editor-avatar").src = src;
  if ($("#comment-avatar")) $("#comment-avatar").src = src;
  if ($("#editor-name")) $("#editor-name").textContent = currentProfile?.display_name || "Tài khoản";
}

function showApp() {
  $("#auth-screen").classList.add("hidden");
  $("#app-screen").classList.remove("hidden");
  setProfileImages();
  applyTheme(currentProfile?.theme || "system");
}

function showAuth() {
  $("#app-screen").classList.add("hidden");
  $("#auth-screen").classList.remove("hidden");
}

function switchAuth(view) {
  $("#login-form").classList.toggle("hidden", view !== "login");
  $("#signup-form").classList.toggle("hidden", view !== "signup");
}

async function ensureProfile() {
  if (!currentUser) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await db.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (data) { currentProfile = data; return data; }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("Không tìm thấy hồ sơ. Vui lòng tải lại trang.");
}

async function handleAuthState(session) {
  currentUser = session?.user || null;
  if (!currentUser) { currentProfile = null; showAuth(); return; }
  try {
    await ensureProfile(); showApp(); await loadFeed(true);
  } catch (error) { showToast(error.message); }
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  setBusy(e.submitter, true, "Đang đăng nhập...");
  const { data, error } = await db.auth.signInWithPassword({ email: $("#login-email").value, password: $("#login-password").value });
  if (error) showToast("Đăng nhập thất bại: " + error.message);
  else { currentUser = data.user; await ensureProfile(); showApp(); await loadFeed(true); }
  setBusy(e.submitter, false);
});

$("#logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  hideModal("settings-modal");
  currentUser = null; currentProfile = null; showAuth();
});

$$("[data-show-auth]").forEach(btn => btn.addEventListener("click", () => switchAuth(btn.dataset.showAuth)));

// ================= NAVIGATION =================

function showView(view, targetUserId = null) {
  $("#feed-view").classList.toggle("hidden", view !== "feed");
  $("#profile-view").classList.toggle("hidden", view !== "profile");
  $("#nav-home").classList.toggle("active", view === "feed");
  
  const isMyProfile = view === "profile" && (!targetUserId || targetUserId === currentUser.id);
  $("#nav-profile").classList.toggle("active", isMyProfile);

  if (view === "profile") {
    viewingProfileId = targetUserId || currentUser.id;
    loadProfileView(viewingProfileId);
  } else { viewingProfileId = null; }
  window.scrollTo(0, 0);
}

$("#home-btn").addEventListener("click", () => showView("feed"));
$("#nav-home").addEventListener("click", () => showView("feed"));
$("#nav-profile").addEventListener("click", () => showView("profile", currentUser.id));
$("#profile-btn").addEventListener("click", () => {
  $("#settings-profile").innerHTML = `<img class="avatar huge" src="${escapeHTML(avatarURL(currentProfile))}"><h3 style="margin-top:10px">${escapeHTML(currentProfile?.display_name || "Tài khoản")}</h3>`;
  showModal("settings-modal");
});
$("#settings-edit-profile").addEventListener("click", () => { hideModal("settings-modal"); openProfileEditor(); });
$("#settings-theme-toggle").addEventListener("click", async () => {
  const next = currentProfile.theme === "light" ? "dark" : "light";
  await db.from("profiles").update({ theme: next }).eq("id", currentUser.id);
  currentProfile.theme = next; applyTheme(next);
});

// ================= MARKDOWN & SANITIZE HTML =================

function renderRichText(value) {
  if (!value) return "";
  let html = escapeHTML(value);
  html = html.replace(/&lt;(\/?)(b|strong|i|em|u|br)&gt;/gi, "<$1$2>");
  html = html.replace(/\\/g, ""); // Fix lỗi chéo ngược
  
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  html = html.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  html = html.replace(/^(?:<br>)?### (.*)$/gm, '<h3>$1</h3>')
             .replace(/^(?:<br>)?## (.*)$/gm, '<h2>$1</h2>')
             .replace(/^(?:<br>)?# (.*)$/gm, '<h1>$1</h1>')
             .replace(/^(?:<br>)?&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
             .replace(/^(?:<br>)?- (.*)$/gm, '• $1');

  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<b><i>$1</i></b>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\*(.*?)\*/g, '<i>$1</i>');

  return html.replace(/\n/g, "<br>");
}

function sanitizeEditorHTML(html) { 
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const allowedTags = ['B', 'I', 'U', 'BR', 'DIV', 'P'];
  
  function clean(node) {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === 1) { 
        if (!allowedTags.includes(child.tagName)) {
          const textNode = document.createTextNode(child.textContent || "");
          child.replaceWith(textNode);
        } else {
          while (child.attributes.length > 0) child.removeAttribute(child.attributes[0].name);
          clean(child); 
        }
      } else if (child.nodeType !== 3) { child.remove(); }
    });
  }
  clean(doc.body);
  
  let cleanHtml = doc.body.innerHTML;
  cleanHtml = cleanHtml.replace(/<div><br><\/div>/gi, "<br>"); 
  cleanHtml = cleanHtml.replace(/<div>/gi, "<br>").replace(/<\/div>/gi, "");
  cleanHtml = cleanHtml.replace(/<p>/gi, "<br>").replace(/<\/p>/gi, "");
  
  return cleanHtml.trim(); 
}

// BẮT SỰ KIỆN COPY/PASTE: Loại bỏ style rác
$("#post-content").addEventListener("paste", (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
});

// THAO TÁC TOOLBAR MARKDOWN
$$(".format-toolbar button").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    $("#post-content").focus();

    if (btn.dataset.format) document.execCommand(btn.dataset.format, false, null);
    else if (btn.dataset.md) document.execCommand('insertText', false, btn.dataset.md);
    else if (btn.dataset.mdWrap) {
      const selection = window.getSelection();
      const text = selection.toString();
      const wrap = btn.dataset.mdWrap;
      document.execCommand('insertText', false, wrap + text + wrap);
    }
  });
});

// ================= FEED & POSTS =================

async function loadFeed(reset = false) {
  if (!currentUser) return;
  if (reset) { feedOffset = 0; $("#feed-list").innerHTML = '<div class="loading">Đang tải bài viết...</div>'; }
  const button = $("#load-more-btn"); button.disabled = true;

  try {
    const { data: posts } = await db.from("posts").select("*").order("created_at", { ascending: false }).range(feedOffset, feedOffset + PAGE_SIZE - 1);
    if (reset) $("#feed-list").innerHTML = "";
    if (!posts?.length && feedOffset === 0) $("#feed-list").innerHTML = '<div class="empty-state">Chưa có bài viết nào.</div>';
    else await renderPosts(posts || [], $("#feed-list"));
    feedOffset += (posts || []).length;
    button.classList.toggle("hidden", (posts || []).length < PAGE_SIZE);
  } catch (error) { showToast("Lỗi tải bảng tin: " + error.message); }
  button.disabled = false;
}
$("#refresh-feed").addEventListener("click", () => loadFeed(true));
$("#load-more-btn").addEventListener("click", () => loadFeed(false));

async function renderPosts(posts, container) {
  if (!posts.length) return;
  const authorIds = [...new Set(posts.map(p => p.author_id))];
  const postIds = posts.map(p => p.id);

  const [profilesRes, reactsRes, commentsRes] = await Promise.all([
    db.from("profiles").select("id,display_name,avatar_url").in("id", authorIds),
    db.from("reactions").select("post_id,user_id,reaction_type").in("post_id", postIds),
    db.from("comments").select("post_id,id").in("post_id", postIds)
  ]);

  const profiles = Object.fromEntries((profilesRes.data || []).map(p => [p.id, p]));
  const reactionsByPost = {}; (reactsRes.data || []).forEach(r => { (reactionsByPost[r.post_id] ||= []).push(r); });
  const commentCounts = {}; (commentsRes.data || []).forEach(c => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });

  for (const post of posts) {
    const author = profiles[post.author_id] || { display_name: "Tài khoản ẩn" };
    const reacts = reactionsByPost[post.id] || [];
    const myReact = reacts.find(r => r.user_id === currentUser.id);
    const reactSummary = REACTIONS.map(item => ({ ...item, count: reacts.filter(r => r.reaction_type === item.type).length })).filter(i => i.count > 0);

    const isOwner = post.author_id === currentUser.id;
    const card = document.createElement("article");
    card.className = "post-card";
    card.dataset.postId = post.id;
    card.innerHTML = `
      <div class="post-head">
        <img class="avatar view-profile" data-uid="${post.author_id}" src="${escapeHTML(avatarURL(author))}" alt="">
        <div class="post-head-info">
          <strong class="view-profile" data-uid="${post.author_id}">${escapeHTML(author.display_name)}</strong>
          <div class="post-meta">${escapeHTML(formatDate(post.created_at))}</div>
        </div>
        <button class="post-menu" data-action="post-menu">⋯</button>
      </div>
      <div class="post-body">${renderRichText(post.content || "")}</div>
      ${(post.image_urls || []).map(url => `<img style="width:100%;max-height:400px;object-fit:cover" src="${escapeHTML(safeURL(url))}">`).join("")}
      <div class="post-stats">
        <span>${reactSummary.map(r => `${r.icon} ${r.count}`).join(" ")}</span>
        <span>${commentCounts[post.id] || 0} bình luận</span>
      </div>
      <div class="post-actions">
        <button data-action="react" class="${myReact ? "reacted" : ""}">${myReact ? REACTIONS.find(r => r.type === myReact.reaction_type)?.icon + " " + REACTIONS.find(r => r.type === myReact.reaction_type)?.label : "👍 Thích"}</button>
        <button data-action="comments">▢ Bình luận</button>
        <button data-action="share">↗ Chia sẻ</button>
      </div>
      <div class="reaction-picker hidden">
        ${REACTIONS.map(r => `<button data-reaction="${r.type}">${r.icon}</button>`).join("")}
      </div>
      <div class="post-menu-panel hidden">
        ${isOwner ? `<button data-action="edit-post">Chỉnh sửa</button>` : ""}
        ${isOwner ? `<button data-action="toggle-comments">${post.comments_enabled ? "Tắt bình luận" : "Bật bình luận"}</button>` : ""}
        <button data-action="copy-link">Sao chép liên kết</button>
        ${isOwner ? `<button data-action="delete-post" class="danger-text">Xóa</button>` : ""}
      </div>
    `;
    container.appendChild(card);
  }
}

// ================= POST EDITOR & UPLOAD =================

function openPostEditor(post = null) {
  selectedImages = []; $("#image-preview").innerHTML = ""; $("#post-images").value = "";
  editingPostId = post?.id || null;
  $("#post-modal-title").textContent = post ? "Chỉnh sửa bài viết" : "Tạo bài viết";
  $("#publish-post-btn").textContent = post ? "Lưu" : "Đăng";
  
  if (post) {
    let editContent = post.content || "";
    // Xóa mã hóa HTML cũ nếu có
    if (editContent.includes("&lt;")) {
      const txt = document.createElement("textarea");
      txt.innerHTML = editContent;
      editContent = txt.value; 
    }
    // Dọn sạch mã cũ rồi mới đưa vào khung viết
    $("#post-content").innerHTML = sanitizeEditorHTML(editContent);
    
    $("#comments-enabled").checked = !!post.comments_enabled;
    selectedImages = (post.image_urls || []).map(url => ({ existing: true, url }));
    renderImagePreview();
  } else {
    $("#post-content").innerHTML = "";
    $("#comments-enabled").checked = true;
  }
  showModal("post-modal"); 
  setTimeout(() => $("#post-content").focus(), 100);
}

$("#new-post-btn").addEventListener("click", () => openPostEditor());
$("#composer-launch").addEventListener("click", () => openPostEditor());

$("#post-images").addEventListener("change", (e) => {
  for (const file of e.target.files) selectedImages.push({ file });
  e.target.value = ""; renderImagePreview();
});

function renderImagePreview() {
  $("#image-preview").innerHTML = selectedImages.map((item, index) => {
    const src = item.file ? URL.createObjectURL(item.file) : item.url;
    return `<div class="preview-item"><img src="${escapeHTML(src)}"><button type="button" data-remove-image="${index}">×</button></div>`;
  }).join("");
}

$("#image-preview").addEventListener("click", (e) => {
  if (e.target.dataset.removeImage !== undefined) {
    selectedImages.splice(Number(e.target.dataset.removeImage), 1); renderImagePreview();
  }
});

async function uploadImage(file, folder) {
  const path = `${currentUser.id}/${folder}/${crypto.randomUUID()}`;
  const { data, error } = await db.storage.from(STORAGE_BUCKET).upload(path, file);
  if (error) throw error;
  return db.storage.from(STORAGE_BUCKET).getPublicUrl(data.path).data.publicUrl;
}

$("#publish-post-btn").addEventListener("click", async () => {
  const content = $("#post-content").innerHTML.trim();
  const existingURLs = selectedImages.filter(x => x.existing).map(x => x.url);
  if (!$("#post-content").innerText.trim() && !selectedImages.length) return showToast("Vui lòng nhập nội dung hoặc thêm ảnh.");

  setBusy($("#publish-post-btn"), true);
  try {
    const imageURLs = [...existingURLs];
    for (const item of selectedImages) if (item.file) imageURLs.push(await uploadImage(item.file, "posts"));
    
    const payload = { 
      content: sanitizeEditorHTML(content), 
      image_urls: imageURLs, 
      comments_enabled: $("#comments-enabled").checked 
    };
    
    if (editingPostId) await db.from("posts").update(payload).eq("id", editingPostId);
    else await db.from("posts").insert({ ...payload, author_id: currentUser.id });
    
    hideModal("post-modal"); await loadFeed(true);
    if (viewingProfileId) await loadProfileView(viewingProfileId);
    showToast(editingPostId ? "Đã cập nhật bài viết." : "Đã đăng bài viết mới.");
  } catch (error) { showToast(error.message); }
  setBusy($("#publish-post-btn"), false);
});

// ================= GLOBAL CLICK EVENTS =================

document.addEventListener("click", async (e) => {
  if (e.target.closest(".view-profile")) {
    showView("profile", e.target.closest(".view-profile").dataset.uid);
    return;
  }

  const actionBtn = e.target.closest("[data-action], [data-reaction]");
  if (!actionBtn) return;
  
  const card = actionBtn.closest("[data-post-id]");
  const postId = card ? card.dataset.postId : null;
  const action = actionBtn.dataset.action;

  if (action === "share-profile") {
    navigator.clipboard.writeText(`${location.origin}${location.pathname}#profile-${actionBtn.dataset.profileId}`);
    showToast("Đã sao chép liên kết hồ sơ.");
    actionBtn.closest(".post-menu-panel").classList.add("hidden");
    return;
  }
  if (action === "profile-menu") {
    actionBtn.nextElementSibling.classList.toggle("hidden");
    return;
  }

  if (!postId) return;

  if (action === "react") { card.querySelector(".reaction-picker").classList.toggle("hidden"); }
  else if (actionBtn.dataset.reaction) {
    const type = actionBtn.dataset.reaction;
    const existing = await db.from("reactions").select("id,reaction_type").eq("post_id", postId).eq("user_id", currentUser.id).maybeSingle();
    if (existing.data?.reaction_type === type) await db.from("reactions").delete().eq("id", existing.data.id);
    else if (existing.data) await db.from("reactions").update({ reaction_type: type }).eq("id", existing.data.id);
    else await db.from("reactions").insert({ post_id: postId, user_id: currentUser.id, reaction_type: type });
    await loadFeed(true);
    if (viewingProfileId) await loadProfileView(viewingProfileId);
  }
  else if (action === "comments") await openComments(postId);
  else if (action === "share" || action === "copy-link") {
    navigator.clipboard.writeText(`${location.origin}${location.pathname}#post-${postId}`);
    showToast("Đã sao chép liên kết.");
    if(action === "copy-link") card.querySelector(".post-menu-panel").classList.add("hidden");
  }
  else if (action === "post-menu") card.querySelector(".post-menu-panel")?.classList.toggle("hidden");
  else if (action === "edit-post") {
    const { data } = await db.from("posts").select("*").eq("id", postId).single();
    openPostEditor(data);
  }
  else if (action === "toggle-comments") {
    const { data } = await db.from("posts").select("comments_enabled").eq("id", postId).single();
    await db.from("posts").update({ comments_enabled: !data.comments_enabled }).eq("id", postId);
    await loadFeed(true); showToast("Đã thay đổi trạng thái bình luận.");
  }
  else if (action === "delete-post") {
    const ok = await showCustomDialog("Xóa bài viết", "Bạn chắc chắn muốn xóa bài viết này chứ?");
    if (ok) {
      await db.from("posts").delete().eq("id", postId);
      await loadFeed(true); if (viewingProfileId) await loadProfileView(viewingProfileId);
      showToast("Đã xóa bài viết.");
    }
  }
});

// ================= COMMENTS =================

async function openComments(postId) {
  const { data: post } = await db.from("posts").select("id,comments_enabled").eq("id", postId).single();
  currentCommentsPost = post; replyingToCommentId = null;
  $("#reply-indicator").classList.add("hidden");
  $("#comment-input").disabled = !post.comments_enabled;
  $("#comment-input").placeholder = post.comments_enabled ? "Viết bình luận..." : "Đã tắt bình luận";
  await loadComments(); showModal("comments-modal");
}

async function loadComments() {
  if (!currentCommentsPost) return;
  const { data: comments } = await db.from("comments").select("*").eq("post_id", currentCommentsPost.id).order("created_at", { ascending: true });
  
  const ids = [...new Set((comments || []).map(c => c.author_id))];
  const { data: profilesData } = ids.length ? await db.from("profiles").select("id,display_name,avatar_url").in("id", ids) : { data: [] };
  const profiles = Object.fromEntries((profilesData || []).map(p => [p.id, p]));

  const roots = (comments || []).filter(c => !c.parent_id);
  const replies = (comments || []).filter(c => c.parent_id);

  let html = "";
  if (!comments?.length) html = '<div class="empty-state">Chưa có bình luận nào.</div>';
  else {
    roots.forEach(root => {
      html += renderCommentRow(root, profiles, false);
      replies.filter(r => r.parent_id === root.id).forEach(reply => {
        html += renderCommentRow(reply, profiles, true);
      });
    });
  }
  $("#comments-list").innerHTML = html;
}

function renderCommentRow(comment, profiles, isReply) {
  const profile = profiles[comment.author_id] || { display_name: "Người dùng" };
  const isMe = comment.author_id === currentUser.id;
  return `
    <div class="comment-row ${isReply ? 'is-reply' : ''}" data-comment-id="${comment.id}" data-author-name="${escapeHTML(profile.display_name)}">
      <img class="avatar tiny view-profile" data-uid="${comment.author_id}" src="${escapeHTML(avatarURL(profile))}">
      <div class="comment-bubble">
        <strong class="view-profile" data-uid="${comment.author_id}">${escapeHTML(profile.display_name)}</strong>
        <p>${escapeHTML(comment.content).replace(/\n/g, "<br>")}</p>
        <div class="comment-tools">
          <button data-comment-action="react">Thích</button>
          <button data-comment-action="reply">Trả lời</button>
          <button data-comment-action="menu">⋯</button>
        </div>
        <div class="comment-menu-panel hidden">
          ${isMe ? `<button data-comment-action="edit">Sửa</button><button data-comment-action="delete">Xóa</button>` : ""}
          <button data-comment-action="copy">Sao chép</button>
        </div>
      </div>
    </div>`;
}

$("#cancel-reply-btn").addEventListener("click", () => {
  replyingToCommentId = null; $("#reply-indicator").classList.add("hidden"); $("#comment-input").focus();
});

$("#comment-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentCommentsPost?.comments_enabled) return;
  const content = $("#comment-input").value.trim();
  if (!content) return;
  
  setBusy(e.submitter, true, "Gửi...");
  try {
    const payload = { post_id: currentCommentsPost.id, author_id: currentUser.id, content };
    if (replyingToCommentId) payload.parent_id = replyingToCommentId; 
    await db.from("comments").insert(payload);
    
    $("#comment-input").value = ""; replyingToCommentId = null; $("#reply-indicator").classList.add("hidden");
    await loadComments(); await loadFeed(true);
  } catch (error) { showToast(error.message); }
  setBusy(e.submitter, false);
});

$("#comments-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-comment-action]");
  if (!btn) return;
  const row = btn.closest("[data-comment-id]");
  const commentId = row.dataset.commentId;
  const action = btn.dataset.commentAction;

  if (action === "menu") { row.querySelector(".comment-menu-panel").classList.toggle("hidden"); return; }
  if (action === "reply") {
    const isReply = row.classList.contains('is-reply');
    replyingToCommentId = isReply ? row.dataset.parentId : commentId; 
    $("#reply-to-text").textContent = "Đang trả lời " + row.dataset.authorName;
    $("#reply-indicator").classList.remove("hidden");
    $("#comment-input").focus();
    return;
  }
  if (action === "copy") {
    navigator.clipboard.writeText(row.querySelector("p").innerText);
    showToast("Đã sao chép bình luận.");
    row.querySelector(".comment-menu-panel").classList.add("hidden");
    return;
  }
  if (action === "react") { showToast("Bạn đã bày tỏ cảm xúc với bình luận này."); return; }

  const { data: comment } = await db.from("comments").select("*").eq("id", commentId).single();
  if (action === "edit") {
    const updated = await showCustomDialog("Sửa bình luận", "Nhập nội dung mới:", true, comment.content);
    if (updated && updated.trim()) {
      await db.from("comments").update({ content: updated.trim() }).eq("id", commentId);
      await loadComments();
    }
  } else if (action === "delete") {
    const ok = await showCustomDialog("Xóa bình luận", "Bạn chắc chắn muốn xóa?");
    if (ok) { await db.from("comments").delete().eq("id", commentId); await loadComments(); await loadFeed(true); }
  }
});

// ================= PROFILE & SOCIAL LINKS =================

async function loadProfileView(userId) {
  try {
    const { data: profile } = await db.from("profiles").select("*").eq("id", userId).single();
    if (!profile) throw new Error("Hồ sơ không tồn tại.");
    const isMe = userId === currentUser.id;
    
    let coverHtml = profile.cover_url ? `<img class="cover-image" src="${escapeHTML(safeURL(profile.cover_url))}">` : `<div class="cover-image"></div>`;
    
    $("#profile-panel").innerHTML = `
      ${coverHtml}
      <div style="position:relative;">
        <img class="avatar huge" src="${escapeHTML(avatarURL(profile))}" style="margin-top:-50px; position:relative; z-index:2; border: 3px solid var(--surface)">
        <div style="position: absolute; right: 20px; top: 10px; display: flex; gap: 10px;">
          ${isMe ? `<button class="btn secondary" id="edit-profile-btn">Chỉnh sửa</button>` : ""}
          <div style="position: relative;">
            <button class="icon-button" data-action="profile-menu">⋯</button>
            <div class="post-menu-panel hidden" style="top: 45px; right: 0;">
              <button data-action="share-profile" data-profile-id="${profile.id}">Sao chép liên kết hồ sơ</button>
            </div>
          </div>
        </div>
      </div>
      <div class="profile-info" style="padding: 10px 24px 24px;">
        <h2 style="margin: 5px 0;">${escapeHTML(profile.display_name)}</h2>
        <div class="profile-bio">${escapeHTML(profile.bio || "")}</div>
        <div id="view-social-links" class="profile-links"></div>
      </div>
    `;

    if (isMe) $("#edit-profile-btn")?.addEventListener("click", openProfileEditor);

    const { data: links } = await db.from("social_links").select("*").eq("profile_id", userId);
    $("#view-social-links").innerHTML = (links || []).map(link => {
      const url = safeURL(link.url);
      return url ? `<a href="${escapeHTML(url)}" target="_blank">${escapeHTML(link.platform)}</a>` : "";
    }).join("");

    const { data: posts } = await db.from("posts").select("*").eq("author_id", userId).order("created_at", { ascending: false }).limit(30);
    $("#profile-posts").innerHTML = "";
    if (!posts?.length) $("#profile-posts").innerHTML = '<div class="empty-state">Chưa có bài viết.</div>';
    else await renderPosts(posts, $("#profile-posts"));
  } catch (err) { showToast(err.message); }
}

async function openProfileEditor() {
  await ensureProfile();
  $("#edit-display-name").value = currentProfile.display_name || "";
  $("#edit-bio").value = currentProfile.bio || "";
  $("#edit-theme").value = currentProfile.theme || "system";
  $("#edit-avatar-preview").src = avatarURL(currentProfile);
  
  if (coverURL(currentProfile)) {
    $("#edit-cover-preview").src = coverURL(currentProfile);
    $("#edit-cover-preview").style.display = "block";
  } else { $("#edit-cover-preview").style.display = "none"; }
  
  selectedAvatarFile = null; selectedCoverFile = null;
  const { data: links } = await db.from("social_links").select("*").eq("profile_id", currentUser.id);
  currentSocialLinks = links || [];
  renderSocialLinksEditor();

  hideModal("settings-modal"); showModal("profile-modal");
}

$("#avatar-file").addEventListener("change", (e) => {
  const file = e.target.files?.[0]; if(!file) return;
  selectedAvatarFile = file; $("#edit-avatar-preview").src = URL.createObjectURL(file);
});

$("#cover-file").addEventListener("change", (e) => {
  const file = e.target.files?.[0]; if(!file) return;
  selectedCoverFile = file; 
  $("#edit-cover-preview").src = URL.createObjectURL(file);
  $("#edit-cover-preview").style.display = "block";
});

$("#toggle-social-editor").addEventListener("click", () => $("#social-links-editor").classList.toggle("hidden"));
$("#new-social-platform").addEventListener("change", (e) => {
  $("#new-social-name").classList.toggle("hidden", e.target.value !== "khac");
});

function renderSocialLinksEditor() {
  $("#social-list-dynamic").innerHTML = currentSocialLinks.map((l, i) => `
    <div class="social-row">
      <strong style="width:100px;">${escapeHTML(l.platform)}:</strong>
      <input type="url" value="${escapeHTML(l.url)}" readonly>
      <button type="button" class="btn secondary" onclick="removeSocialLink(${i})">Xóa</button>
    </div>
  `).join("");
}
window.removeSocialLink = (index) => { currentSocialLinks.splice(index, 1); renderSocialLinksEditor(); };

$("#add-social-btn").addEventListener("click", () => {
  const p = $("#new-social-platform").value;
  const name = p === "khac" ? $("#new-social-name").value.trim() : $("#new-social-platform").options[$("#new-social-platform").selectedIndex].text;
  const url = safeURL($("#new-social-url").value.trim());
  if (!name || !url) return showToast("Vui lòng nhập tên và liên kết hợp lệ.");
  currentSocialLinks.push({ platform: name, url });
  $("#new-social-url").value = ""; $("#new-social-name").value = "";
  renderSocialLinksEditor();
});

$("#save-profile-btn").addEventListener("click", async () => {
  if (!$("#edit-display-name").value.trim()) return showToast("Tên không được để trống.");
  setBusy($("#save-profile-btn"), true, "Đang lưu...");
  
  try {
    let avatar_url = currentProfile.avatar_url;
    let cover_url = currentProfile.cover_url;
    
    if (selectedAvatarFile) avatar_url = await uploadImage(selectedAvatarFile, "avatars");
    if (selectedCoverFile) cover_url = await uploadImage(selectedCoverFile, "covers");

    await db.from("profiles").update({
      display_name: $("#edit-display-name").value.trim(),
      bio: $("#edit-bio").value.trim(), 
      theme: $("#edit-theme").value,
      avatar_url, cover_url
    }).eq("id", currentUser.id);

    await db.from("social_links").delete().eq("profile_id", currentUser.id);
    if (currentSocialLinks.length) {
      await db.from("social_links").insert(currentSocialLinks.map(l => ({ profile_id: currentUser.id, platform: l.platform, url: l.url })));
    }

    await ensureProfile(); setProfileImages(); applyTheme(currentProfile.theme);
    hideModal("profile-modal"); loadProfileView(currentUser.id);
    showToast("Đã cập nhật hồ sơ thành công.");
  } catch (error) { showToast(error.message); }
  
  setBusy($("#save-profile-btn"), false);
});

// ================= KHỞI TẠO =================

$$("[data-close]").forEach(btn => btn.addEventListener("click", () => hideModal(btn.dataset.close)));
$$(".modal").forEach(m => m.addEventListener("click", (e) => { 
  if (e.target === m && m.id !== 'custom-dialog') m.classList.add("hidden"); 
}));

async function initialize() {
  const { data } = await db.auth.getSession();
  await handleAuthState(data.session);
}

db.auth.onAuthStateChange((_e, session) => setTimeout(() => handleAuthState(session), 0));
initialize();
