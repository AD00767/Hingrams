/* =========================================================
   HINGRAM — FRONTEND APP.JS
   Đã tích hợp: Xử lý dán văn bản (Paste), Markdown chuẩn,
   Ảnh bìa, Cây bình luận, Custom Dialog & Link động.
   ========================================================= */

const SUPABASE_URL = "https://ipylukvdvttfvfftgpnm.supabase.co";
const SUPABASE_KEY = "sb_publishable_gHfQp9FqnMfEa9l_Lc69_w_XrPyRGCC";
const STORAGE_BUCKET = "hingram-media";

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// Trạng thái ứng dụng
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

/* ==========================================
   CÁC HÀM TIỆN ÍCH (UTILITIES)
   ========================================== */

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

// HIỆP THOẠI TÙY CHỈNH (THAY THẾ PROMPT / CONFIRM)
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
      cleanup();
      resolve(result);
    };
  });
}

function applyTheme(theme) {
  let resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
}

function formatDate(dateValue) {
  if (!dateValue) return "";
  return new Date(dateValue).toLocaleString("vi-VN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function setProfileImages() {
  const src = avatarURL(currentProfile);
  if ($("#top-avatar")) $("#top-avatar").src = src;
  if ($("#composer-avatar")) $("#composer-avatar").src = src;
  if ($("#editor-avatar")) $("#editor-avatar").src = src;
  if ($("#comment-avatar")) $("#comment-avatar").src = src;
  if ($("#editor-name")) $("#editor-name").textContent = currentProfile?.display_name || "Tài khoản";
}

/* ==========================================
   QUẢN LÝ XỬ LÝ VĂN BẢN (MARKDOWN & PASTE)
   ========================================== */

function renderRichText(value) {
  if (!value) return "";
  
  // 1. Chống XSS (Mã hóa HTML cơ bản)
  let html = escapeHTML(value);

  // 2. Khôi phục các thẻ do Toolbar sinh ra
  html = html.replace(/&lt;(\/?)(b|strong|i|em|u|br)&gt;/gi, "<$1$2>");

  // 3. Xóa các dấu "\" rác do lỗi copy
  html = html.replace(/\\/g, "");

  // 4. Nhận diện Link tự động
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  html = html.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  // 5. Xử lý Markdown (H1, H2, H3, Blockquote, Danh sách)
  html = html.replace(/^(?:<br>)?### (.*)$/gm, '<h3>$1</h3>')
             .replace(/^(?:<br>)?## (.*)$/gm, '<h2>$1</h2>')
             .replace(/^(?:<br>)?# (.*)$/gm, '<h1>$1</h1>')
             .replace(/^(?:<br>)?&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
             .replace(/^(?:<br>)?- (.*)$/gm, '• $1');

  // 6. Xử lý In đậm / In nghiêng Markdown
  html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\*(.*?)\*/g, '<i>$1</i>');

  // 7. Ký tự xuống dòng
  return html.replace(/\n/g, "<br>");
}

function sanitizeEditorHTML(html) { 
  const temp = document.createElement("div");
  temp.innerHTML = html;
  
  // Chỉ giữ lại văn bản thô và một số thẻ định dạng, LOẠI BỎ TOÀN BỘ style, class
  const allowed = ['B', 'I', 'U', 'BR', 'DIV', 'P'];
  function clean(node) {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === 1) { // Element
        if (!allowed.includes(child.tagName)) {
          child.replaceWith(document.createTextNode(child.textContent || ""));
        } else {
          Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
          clean(child);
        }
      } else if (child.nodeType !== 3) { // Không phải văn bản
        child.remove();
      }
    });
  }
  clean(temp);
  
  let cleanHtml = temp.innerHTML;
  cleanHtml = cleanHtml.replace(/<div>/gi, "<br>").replace(/<\/div>/gi, "");
  cleanHtml = cleanHtml.replace(/<p>/gi, "<br>").replace(/<\/p>/gi, "");
  
  return cleanHtml; 
}

/* ==========================================
   QUẢN LÝ XÁC THỰC (AUTH) & KHỞI TẠO
   ========================================== */

function switchAuth(view) {
  $("#login-form").classList.toggle("hidden", view !== "login");
  $("#signup-form").classList.toggle("hidden", view !== "signup");
}

function showSignupStep(step) {
  [1, 2, 3].forEach(n => $("#signup-step-" + n).classList.toggle("hidden", n !== step));
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

async function ensureProfile() {
  if (!currentUser) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await db.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (data) { currentProfile = data; return data; }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("Không tìm thấy hồ sơ tài khoản.");
}

async function handleAuthState(session) {
  currentUser = session?.user || null;
  if (!currentUser) { currentProfile = null; showAuth(); return; }
  try {
    await ensureProfile();
    showApp();
    await loadFeed(true);
  } catch (error) { showToast(error.message); }
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  setBusy(e.submitter, true, "Đang đăng nhập...");
  const { data, error } = await db.auth.signInWithPassword({ email: $("#login-email").value, password: $("#login-password").value });
  if (error) showToast(error.message);
  else { currentUser = data.user; await ensureProfile(); showApp(); await loadFeed(true); }
  setBusy(e.submitter, false);
});

$("#logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
  hideModal("settings-modal");
  currentUser = null; currentProfile = null; showAuth();
  showToast("Đã đăng xuất.");
});

// Chuyển form đăng nhập / đăng ký
$$("[data-show-auth]").forEach(btn => btn.addEventListener("click", () => {
  switchAuth(btn.dataset.showAuth);
  if (btn.dataset.showAuth === "signup") showSignupStep(1);
}));

/* --- QUẢN LÝ ĐĂNG KÝ OTP --- */
async function sendSignupOTP() {
  signupDisplayName = $("#signup-name").value.trim();
  signupEmail = $("#signup-email").value.trim().toLowerCase();
  if (signupDisplayName.length < 2) return showToast("Tên cần ít nhất 2 ký tự.");
  if (!signupEmail) return showToast("Email không hợp lệ.");

  setBusy($("#send-otp-btn"), true, "Đang gửi...");
  try {
    const { error } = await db.auth.signInWithOtp({ email: signupEmail, options: { shouldCreateUser: true, data: { display_name: signupDisplayName } } });
    if (error) throw error;
    $("#signup-otp").value = ""; showSignupStep(2); showToast("Đã yêu cầu mã.");
  } catch (err) { showToast(err.message); }
  setBusy($("#send-otp-btn"), false);
}
$("#send-otp-btn").addEventListener("click", sendSignupOTP);
$("#resend-otp-btn").addEventListener("click", sendSignupOTP);

$("#verify-otp-btn").addEventListener("click", async () => {
  const token = $("#signup-otp").value.trim();
  if (!/^\d{8}$/.test(token)) return showToast("Mã phải gồm 8 chữ số.");
  setBusy($("#verify-otp-btn"), true, "Đang xác minh...");
  try {
    const { data, error } = await db.auth.verifyOtp({ email: signupEmail, token, type: "email" });
    if (error) throw error;
    currentUser = data.user; verifiedSignupUser = true;
    await db.auth.updateUser({ data: { display_name: signupDisplayName } });
    showSignupStep(3); showToast("Đã xác minh, hãy tạo mật khẩu.");
  } catch (err) { showToast("Mã không hợp lệ hoặc đã hết hạn."); }
  setBusy($("#verify-otp-btn"), false);
});

$("#signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!verifiedSignupUser) return showToast("Hãy xác minh email trước.");
  const pwd = $("#signup-password").value, cfm = $("#signup-confirm").value;
  if (pwd.length < 8) return showToast("Mật khẩu ít nhất 8 ký tự.");
  if (pwd !== cfm) return showToast("Mật khẩu không khớp.");
  
  setBusy(e.submitter, true, "Đang hoàn tất...");
  try {
    await db.auth.updateUser({ password: pwd });
    await ensureProfile();
    await db.from("profiles").update({ display_name: signupDisplayName }).eq("id", currentUser.id);
    verifiedSignupUser = false; showApp(); await loadFeed(true);
  } catch (err) { showToast(err.message); }
  setBusy(e.submitter, false);
});


/* ==========================================
   NAVIGATION (ĐIỀU HƯỚNG)
   ========================================== */

function showView(view, targetUserId = null) {
  $("#feed-view").classList.toggle("hidden", view !== "feed");
  $("#profile-view").classList.toggle("hidden", view !== "profile");
  $("#nav-home").classList.toggle("active", view === "feed");
  
  const isMyProfile = view === "profile" && (!targetUserId || targetUserId === currentUser.id);
  $("#nav-profile").classList.toggle("active", isMyProfile);

  if (view === "profile") {
    viewingProfileId = targetUserId || currentUser.id;
    loadProfileView(viewingProfileId);
  } else {
    viewingProfileId = null;
  }
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


/* ==========================================
   BẢNG TIN VÀ HIỂN THỊ BÀI VIẾT (FEED)
   ========================================== */

async function loadFeed(reset = false) {
  if (!currentUser) return;
  if (reset) { feedOffset = 0; $("#feed-list").innerHTML = '<div class="loading">Đang tải...</div>'; }
  const button = $("#load-more-btn"); button.disabled = true;

  try {
    const { data: posts } = await db.from("posts").select("*").order("created_at", { ascending: false }).range(feedOffset, feedOffset + PAGE_SIZE - 1);
    if (reset) $("#feed-list").innerHTML = "";
    if (!posts?.length && feedOffset === 0) $("#feed-list").innerHTML = '<div class="empty-state">Chưa có bài viết nào.</div>';
    else await renderPosts(posts || [], $("#feed-list"));
    feedOffset += (posts || []).length;
    button.classList.toggle("hidden", (posts || []).length < PAGE_SIZE);
  } catch (error) { showToast(error.message); }
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
    db.from("comments").select("post_id,id").in
