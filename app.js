
/* =========================================================
   HINGRAM — FRONTEND
   Yêu cầu: Supabase JS v2, các bảng đã tạo ở giai đoạn SQL.
   Không đặt service_role key trong tệp này.
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
let feedOffset = 0;
const PAGE_SIZE = 10;
let currentCommentsPost = null;
let editingPostId = null;
let selectedImages = [];
let selectedAvatarFile = null;
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

const SOCIAL_PLATFORMS = [
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["x", "X"],
  ["threads", "Threads"],
  ["discord", "Discord"],
  ["website", "Website"]
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

function showModal(id) {
  $("#" + id)?.classList.remove("hidden");
}

function hideModal(id) {
  $("#" + id)?.classList.add("hidden");
}

function switchAuth(view) {
  $("#login-form").classList.toggle("hidden", view !== "login");
  $("#signup-form").classList.toggle("hidden", view !== "signup");
}

function showSignupStep(step) {
  [1, 2, 3].forEach(number => {
    $("#signup-step-" + number).classList.toggle("hidden", number !== step);
  });
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
  $("#top-name").textContent = currentProfile?.display_name || "Tài khoản";
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
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function ensureProfile() {
  if (!currentUser) return null;

  // Trigger ở cơ sở dữ liệu là nguồn tạo hồ sơ chính.
  // Thử đọc lại trong trường hợp trigger chưa hoàn tất ngay lập tức.
  for (let attempt = 0; attempt < 3; attempt++) {
    const profile = await getProfile(currentUser.id);
    if (profile) {
      currentProfile = profile;
      return profile;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(
    "Không tìm thấy hồ sơ tài khoản. Hãy kiểm tra trigger tạo profiles trong Supabase."
  );
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
    console.error(error);
    showToast(error.message || "Không thể tải hồ sơ.");
  }
}

/* ---------------- AUTH ---------------- */

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = event.submitter;
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
  } catch (error) {
    showToast(error.message || "Đăng nhập thất bại.");
  } finally {
    setBusy(button, false);
  }
});

/*
  Luồng đăng ký:
  1. Nhập tên + email.
  2. signInWithOtp gửi OTP qua email và có thể tạo tài khoản Auth.
  3. verifyOtp xác minh mã.
  4. updateUser đặt mật khẩu sau khi xác minh.
  Yêu cầu mẫu email Supabase gửi đúng OTP dạng số và độ dài đã cấu hình.
*/
async function sendSignupOTP() {
  signupDisplayName = $("#signup-name").value.trim();
  signupEmail = $("#signup-email").value.trim().toLowerCase();

  if (signupDisplayName.length < 2) {
    showToast("Tên hiển thị cần có ít nhất 2 ký tự.");
    return;
  }
  if (!signupEmail || !$("#signup-email").checkValidity()) {
    showToast("Hãy nhập địa chỉ email hợp lệ.");
    return;
  }

  const button = $("#send-otp-btn");
  setBusy(button, true, "Đang gửi mã...");

  try {
    const { error } = await db.auth.signInWithOtp({
      email: signupEmail,
      options: {
        shouldCreateUser: true,
        data: { display_name: signupDisplayName }
      }
    });
    if (error) throw error;

    $("#signup-otp").value = "";
    showSignupStep(2);
    showToast("Đã yêu cầu gửi mã. Hãy kiểm tra hộp thư và thư rác.");
  } catch (error) {
    showToast(error.message || "Không thể gửi mã xác minh.");
  } finally {
    setBusy(button, false);
  }
}

$("#send-otp-btn").addEventListener("click", sendSignupOTP);

$("#resend-otp-btn").addEventListener("click", async () => {
  if (!signupEmail) {
    showToast("Hãy nhập email trước.");
    showSignupStep(1);
    return;
  }
  $("#signup-email").value = signupEmail;
  $("#signup-name").value = signupDisplayName;
  await sendSignupOTP();
});

$("#verify-otp-btn").addEventListener("click", async () => {
  const token = $("#signup-otp").value.trim();
  if (!/^\d{8}$/.test(token)) {
    showToast("Mã xác minh phải gồm đúng 8 chữ số.");
    return;
  }

  const button = $("#verify-otp-btn");
  setBusy(button, true, "Đang xác minh...");

  try {
    const { data, error } = await db.auth.verifyOtp({
      email: signupEmail,
      token,
      type: "email"
    });
    if (error) throw error;

    currentUser = data.user;
    verifiedSignupUser = true;

    // Giữ tên hiển thị đã nhập ở bước đầu.
    const { error: updateError } = await db.auth.updateUser({
      data: { display_name: signupDisplayName }
    });
    if (updateError) throw updateError;

    showSignupStep(3);
    showToast("Email đã được xác minh. Hãy tạo mật khẩu.");
  } catch (error) {
    showToast(error.message || "Mã không hợp lệ hoặc đã hết hạn.");
  } finally {
    setBusy(button, false);
  }
});

$("#signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!verifiedSignupUser || !currentUser) {
    showToast("Hãy xác minh email trước khi đặt mật khẩu.");
    return;
  }

  const password = $("#signup-password").value;
  const confirm = $("#signup-confirm").value;

  if (password.length < 8) {
    showToast("Mật khẩu cần có ít nhất 8 ký tự.");
    return;
  }
  if (password !== confirm) {
    showToast("Hai mật khẩu không trùng khớp.");
    return;
  }

  const button = event.submitter;
  setBusy(button, true, "Đang tạo tài khoản...");

  try {
    const { error } = await db.auth.updateUser({ password });
    if (error) throw error;

    // Chờ trigger tạo profile; cập nhật lại tên hiển thị nếu cần.
    await ensureProfile();

    if (currentProfile && currentProfile.display_name !== signupDisplayName) {
      const { error: profileError } = await db.from("profiles")
        .update({ display_name: signupDisplayName })
        .eq("id", currentUser.id);
      if (profileError) throw profileError;
      currentProfile.display_name = signupDisplayName;
    }

    verifiedSignupUser = false;
    $("#signup-password").value = "";
    $("#signup-confirm").value = "";
    showApp();
    await loadFeed(true);
    showToast("Tài khoản Hingram đã được tạo.");
  } catch (error) {
    showToast(error.message || "Không thể hoàn tất đăng ký.");
  } finally {
    setBusy(button, false);
  }
});

$$("[data-show-auth]").forEach(button => {
  button.addEventListener("click", () => {
    switchAuth(button.dataset.showAuth);
    if (button.dataset.showAuth === "signup") showSignupStep(1);
  });
});

$("#logout-btn").addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) {
    showToast(error.message);
    return;
  }
  hideModal("settings-modal");
  currentUser = null;
  currentProfile = null;
  showAuth();
  showToast("Đã đăng xuất.");
});

db.auth.onAuthStateChange((_event, session) => {
  // Tránh gọi tác vụ Supabase đồng bộ ngay bên trong callback.
  setTimeout(() => handleAuthState(session), 0);
});

/* ---------------- NAVIGATION ---------------- */

function showView(view) {
  $("#feed-view").classList.toggle("hidden", view !== "feed");
  $("#profile-view").classList.toggle("hidden", view !== "profile");
  $("#nav-home").classList.toggle("active", view === "feed");
  $("#nav-profile").classList.toggle("active", view === "profile");

  if (view === "profile") loadOwnProfileView();
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
$("#edit-profile-btn").addEventListener("click", openProfileEditor);
$("#settings-theme-toggle").addEventListener("click", async () => {
  const current = currentProfile?.theme || "system";
  const next = current === "light" ? "dark" : current === "dark" ? "system" : "light";
  const { error } = await db.from("profiles")
    .update({ theme: next }).eq("id", currentUser.id);
  if (error) return showToast(error.message);
  currentProfile.theme = next;
  applyCurrentTheme();
  showToast("Đã đổi giao diện.");
});

/* ---------------- FEED ---------------- */

async function loadFeed(reset = false) {
  if (!currentUser) return;

  if (reset) {
    feedOffset = 0;
    $("#feed-list").innerHTML = '<div class="loading">Đang tải bài viết...</div>';
  }

  const button = $("#load-more-btn");
  button.disabled = true;

  try {
    const { data: posts, error } = await db
      .from("posts")
      .select("id,author_id,content,image_urls,comments_enabled,created_at,updated_at")
      .order("created_at", { ascending: false })
      .range(feedOffset, feedOffset + PAGE_SIZE - 1);

    if (error) throw error;

    if (reset) $("#feed-list").innerHTML = "";
    if (!posts.length && feedOffset === 0) {
      $("#feed-list").innerHTML = '<div class="empty-state">Chưa có bài viết nào. Hãy đăng bài đầu tiên.</div>';
    } else {
      await renderPosts(posts, $("#feed-list"));
    }

    feedOffset += posts.length;
    button.classList.toggle("hidden", posts.length < PAGE_SIZE);
  } catch (error) {
    console.error(error);
    if (reset) $("#feed-list").innerHTML = "";
    showToast("Không thể tải bảng tin: " + error.message);
  } finally {
    button.disabled = false;
  }
}

$("#refresh-feed").addEventListener("click", () => loadFeed(true));
$("#load-more-btn").addEventListener("click", () => loadFeed(false));

async function renderPosts(posts, container) {
  if (!posts.length) return;

  const authorIds = [...new Set(posts.map(post => post.author_id))];
  const postIds = posts.map(post => post.id);

  const [profileResult, reactionResult, commentResult] = await Promise.all([
    db.from("profiles").select("id,display_name,avatar_url,role").in("id", authorIds),
    db.from("reactions").select("post_id,user_id,reaction_type").in("post_id", postIds),
    db.from("comments").select("post_id,id").in("post_id", postIds)
  ]);

  if (profileResult.error) throw profileResult.error;
  if (reactionResult.error) throw reactionResult.error;
  if (commentResult.error) throw commentResult.error;

  const profiles = Object.fromEntries((profileResult.data || []).map(p => [p.id, p]));
  const reactionsByPost = {};
  (reactionResult.data || []).forEach(r => {
    (reactionsByPost[r.post_id] ||= []).push(r);
  });
  const commentCounts = {};
  (commentResult.data || []).forEach(c => {
    commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1;
  });

  for (const post of posts) {
    const author = profiles[post.author_id] || {
      display_name: "Tài khoản đã ẩn", avatar_url: null, role: "member"
    };
    const reactions = reactionsByPost[post.id] || [];
    const myReaction = reactions.find(r => r.user_id === currentUser.id);
    const reactionSummary = REACTIONS
      .map(item => ({ ...item, count: reactions.filter(r => r.reaction_type === item.type).length }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count);

    const imageHTML = (post.image_urls || []).map(url => {
      const safe = safeURL(url);
      return safe ? `<img src="${escapeHTML(safe)}" alt="Ảnh bài viết" loading="lazy">` : "";
    }).join("");

    const isOwner = post.author_id === currentUser.id;
    const isAdmin = currentProfile?.role === "admin";
    const canManage = isOwner || isAdmin;
    const card = document.createElement("article");
    card.className = "post-card";
    card.dataset.postId = post.id;

    card.innerHTML = `
      <div class="post-head">
        <img class="avatar" src="${escapeHTML(avatarURL(author))}" alt="">
        <div class="post-head-info">
          <strong>${escapeHTML(author.display_name || "Tài khoản")}${author.role === "admin" ? " · Quản trị viên" : ""}</strong>
          <div class="post-meta">${escapeHTML(formatDate(post.created_at))}${post.updated_at !== post.created_at ? " · Đã chỉnh sửa" : ""}</div>
        </div>
        ${canManage ? `<button class="post-menu" data-action="post-menu" title="Tùy chọn">⋯</button>` : ""}
      </div>
      <div class="post-body">${renderRichText(post.content || "")}</div>
      ${imageHTML ? `<div class="post-images">${imageHTML}</div>` : ""}
      <div class="post-stats">
        <span>${reactionSummary.map(r => `${r.icon} ${r.count}`).join(" ") || "Chưa có biểu cảm"}</span>
        <span>${commentCounts[post.id] || 0} bình luận</span>
      </div>
      <div class="post-actions">
        <button data-action="react" class="${myReaction ? "reacted" : ""}">${myReaction ? REACTIONS.find(r => r.type === myReaction.reaction_type)?.icon + " " + REACTIONS.find(r => r.type === myReaction.reaction_type)?.label : "👍 Thích"}</button>
        <button data-action="comments">▢ Bình luận</button>
        <button data-action="share">↗ Chia sẻ</button>
      </div>
      <div class="reaction-picker hidden">
        ${REACTIONS.map(r => `<button data-reaction="${r.type}" title="${r.label}">${r.icon}</button>`).join("")}
      </div>
      <div class="post-menu-panel hidden">
        ${canManage ? `<button data-action="edit-post">Chỉnh sửa bài viết</button>` : ""}
        ${canManage ? `<button data-action="toggle-comments">${post.comments_enabled ? "Tắt bình luận" : "Bật bình luận"}</button>` : ""}
        ${canManage ? `<button data-action="delete-post" class="danger-text">Xóa bài viết</button>` : ""}
      </div>
    `;
    container.appendChild(card);
  }
}

function renderRichText(value) {
  // Chỉ hỗ trợ các thẻ định dạng cơ bản do trình soạn thảo tạo ra.
  // Không chèn HTML bài viết chưa được làm sạch trực tiếp vào DOM.
  const escaped = escapeHTML(value);
  return escaped
    .replace(/&lt;(\/?)(b|strong|i|em|u|br)&gt;/gi, (match, slash, tag) => {
      const allowed = tag.toLowerCase();
      return allowed === "br" ? "<br>" : `<${slash}${allowed}>`;
    })
    .replace(/\n/g, "<br>");
}

function openPostEditor(post = null) {
  if (!currentUser) return showToast("Hãy đăng nhập trước.");
  selectedImages = [];
  $("#image-preview").innerHTML = "";
  $("#post-images").value = "";
  $("#post-content").innerHTML = "";
  $("#comments-enabled").checked = true;

  editingPostId = post?.id || null;
  $("#post-modal-title").textContent = post ? "Chỉnh sửa bài viết" : "Tạo bài viết";
  $("#publish-post-btn").textContent = post ? "Lưu" : "Đăng";

  if (post) {
    $("#post-content").textContent = post.content || "";
    $("#comments-enabled").checked = !!post.comments_enabled;
    selectedImages = (post.image_urls || []).map(url => ({ existing: true, url }));
    renderImagePreview();
  }

  setProfileImages();
  showModal("post-modal");
  $("#post-content").focus();
}

$("#new-post-btn").addEventListener("click", () => openPostEditor());
$("#composer-launch").addEventListener("click", () => openPostEditor());

$$("[data-format]").forEach(button => {
  button.addEventListener("click", () => {
    $("#post-content").focus();
    document.execCommand(button.dataset.format, false, null);
  });
});

$("#post-images").addEventListener("change", (event) => {
  const files = [...event.target.files];
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  for (const file of files) {
    if (!allowed.includes(file.type)) {
      showToast("Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF.");
      continue;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast("Mỗi ảnh phải nhỏ hơn 8 MB.");
      continue;
    }
    if (selectedImages.length >= 8) {
      showToast("Mỗi bài viết được chọn tối đa 8 ảnh.");
      break;
    }
    selectedImages.push({ file });
  }

  event.target.value = "";
  renderImagePreview();
});

function renderImagePreview() {
  $("#image-preview").innerHTML = selectedImages.map((item, index) => {
    const src = item.file ? URL.createObjectURL(item.file) : item.url;
    return `<div class="preview-item"><img src="${escapeHTML(src)}" alt="Ảnh xem trước"><button type="button" data-remove-image="${index}" aria-label="Bỏ ảnh">×</button></div>`;
  }).join("");
}

$("#image-preview").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-image]");
  if (!button) return;
  selectedImages.splice(Number(button.dataset.removeImage), 1);
  renderImagePreview();
});

async function uploadImage(file, folder) {
  const extension = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${currentUser.id}/${folder}/${crypto.randomUUID()}.${extension || "jpg"}`;
  const { data, error } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type
  });
  if (error) throw error;

  const { data: publicData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  return publicData.publicUrl;
}

$("#publish-post-btn").addEventListener("click", async () => {
  const button = $("#publish-post-btn");
  const content = $("#post-content").innerHTML.trim();
  const plainText = $("#post-content").innerText.trim();
  const existingURLs = selectedImages.filter(x => x.existing).map(x => x.url);

  if (!plainText && selectedImages.length === 0) {
    showToast("Hãy nhập nội dung hoặc thêm ít nhất một ảnh.");
    return;
  }

  setBusy(button, true, editingPostId ? "Đang lưu..." : "Đang đăng...");

  try {
    const imageURLs = [...existingURLs];
    for (const item of selectedImages) {
      if (item.file) imageURLs.push(await uploadImage(item.file, "posts"));
    }

    // Lưu nội dung dạng văn bản có các thẻ định dạng cơ bản.
    // Loại bỏ thẻ không được phép trước khi gửi lên cơ sở dữ liệu.
    const cleanContent = sanitizeEditorHTML(content);

    if (editingPostId) {
      const { error } = await db.from("posts").update({
        content: cleanContent,
        image_urls: imageURLs,
        comments_enabled: $("#comments-enabled").checked
      }).eq("id", editingPostId);
      if (error) throw error;
    } else {
      const { error } = await db.from("posts").insert({
        author_id: currentUser.id,
        content: cleanContent,
        image_urls: imageURLs,
        comments_enabled: $("#comments-enabled").checked
      });
      if (error) throw error;
    }

    hideModal("post-modal");
    await loadFeed(true);
    if (!$("#profile-view").classList.contains("hidden")) await loadOwnProfileView();
    showToast(editingPostId ? "Đã cập nhật bài viết." : "Đã đăng bài viết.");
    editingPostId = null;
  } catch (error) {
    console.error(error);
    showToast("Không thể lưu bài viết: " + error.message);
  } finally {
    setBusy(button, false);
  }
});

function sanitizeEditorHTML(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "BR", "DIV", "P"]);

  function clean(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowed.has(child.tagName)) {
          child.replaceWith(document.createTextNode(child.textContent || ""));
        } else {
          [...child.attributes].forEach(attr => child.removeAttribute(attr.name));
          clean(child);
        }
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    });
  }
  clean(template.content);
  return template.innerHTML;
}

/* ---------------- POST ACTIONS ---------------- */

$("#feed-list").addEventListener("click", handlePostAction);
$("#profile-posts").addEventListener("click", handlePostAction);

async function handlePostAction(event) {
  const card = event.target.closest("[data-post-id]");
  if (!card) return;

  const postId = card.dataset.postId;
  const actionButton = event.target.closest("[data-action], [data-reaction]");
  if (!actionButton) return;

  const action = actionButton.dataset.action;

  try {
    if (action === "react") {
      card.querySelector(".reaction-picker").classList.toggle("hidden");
    } else if (actionButton.dataset.reaction) {
      await toggleReaction(postId, actionButton.dataset.reaction);
      await loadFeed(true);
      if (!$("#profile-view").classList.contains("hidden")) await loadOwnProfileView();
    } else if (action === "comments") {
      await openComments(postId);
    } else if (action === "share") {
      const url = `${location.origin}${location.pathname}#post-${postId}`;
      await navigator.clipboard.writeText(url);
      showToast("Đã sao chép liên kết bài viết.");
    } else if (action === "post-menu") {
      card.querySelector(".post-menu-panel")?.classList.toggle("hidden");
    } else if (action === "edit-post") {
      const { data, error } = await db.from("posts").select("*").eq("id", postId).single();
      if (error) throw error;
      if (data.author_id !== currentUser.id && currentProfile?.role !== "admin") {
        throw new Error("Bạn không có quyền sửa bài viết này.");
      }
      openPostEditor(data);
    } else if (action === "toggle-comments") {
      const { data, error: readError } = await db.from("posts")
        .select("author_id,comments_enabled").eq("id", postId).single();
      if (readError) throw readError;
      if (data.author_id !== currentUser.id && currentProfile?.role !== "admin") {
        throw new Error("Bạn không có quyền thay đổi cài đặt bài viết này.");
      }
      const { error } = await db.from("posts").update({
        comments_enabled: !data.comments_enabled
      }).eq("id", postId);
      if (error) throw error;
      await loadFeed(true);
      showToast(data.comments_enabled ? "Đã tắt bình luận." : "Đã bật bình luận.");
    } else if (action === "delete-post") {
      if (!confirm("Bạn có chắc muốn xóa bài viết này?")) return;
      const { error } = await db.from("posts").delete().eq("id", postId);
      if (error) throw error;
      await loadFeed(true);
      if (!$("#profile-view").classList.contains("hidden")) await loadOwnProfileView();
      showToast("Đã xóa bài viết.");
    }
  } catch (error) {
    showToast(error.message || "Không thể thực hiện thao tác.");
  }
}

async function toggleReaction(postId, type) {
  const { data: existing, error: readError } = await db.from("reactions")
    .select("id,reaction_type").eq("post_id", postId).eq("user_id", currentUser.id).maybeSingle();
  if (readError) throw readError;

  if (existing?.reaction_type === type) {
    const { error } = await db.from("reactions").delete().eq("id", existing.id);
    if (error) throw error;
  } else if (existing) {
    const { error } = await db.from("reactions")
      .update({ reaction_type: type }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await db.from("reactions").insert({
      post_id: postId, user_id: currentUser.id, reaction_type: type
    });
    if (error) throw error;
  }
}

/* ---------------- COMMENTS ---------------- */

async function openComments(postId) {
  const { data: post, error: postError } = await db.from("posts")
    .select("id,comments_enabled").eq("id", postId).single();
  if (postError) throw postError;

  currentCommentsPost = post;
  $("#comment-input").disabled = !post.comments_enabled;
  $("#comment-form").querySelector("button").disabled = !post.comments_enabled;
  $("#comment-input").placeholder = post.comments_enabled
    ? "Viết bình luận..." : "Bài viết đã tắt bình luận";
  await loadComments();
  showModal("comments-modal");
}

async function loadComments() {
  if (!currentCommentsPost) return;

  const { data: comments, error } = await db.from("comments")
    .select("id,post_id,author_id,content,created_at,updated_at")
    .eq("post_id", currentCommentsPost.id)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const ids = [...new Set((comments || []).map(c => c.author_id))];
  let profiles = {};
  if (ids.length) {
    const result = await db.from("profiles").select("id,display_name,avatar_url,role").in("id", ids);
    if (result.error) throw result.error;
    profiles = Object.fromEntries((result.data || []).map(p => [p.id, p]));
  }

  $("#comments-list").innerHTML = (comments || []).map(comment => {
    const profile = profiles[comment.author_id] || { display_name: "Tài khoản" };
    const canManage = comment.author_id === currentUser.id || currentProfile?.role === "admin";
    return `
      <div class="comment-row" data-comment-id="${comment.id}">
        <img class="avatar" src="${escapeHTML(avatarURL(profile))}" alt="">
        <div class="comment-bubble">
          <strong>${escapeHTML(profile.display_name || "Tài khoản")}</strong>
          <p>${escapeHTML(comment.content).replace(/\n/g, "<br>")}</p>
          <div class="comment-tools">
            <span>${escapeHTML(formatDate(comment.created_at))}</span>
            ${comment.updated_at !== comment.created_at ? "<span>Đã chỉnh sửa</span>" : ""}
            ${canManage ? '<button data-comment-action="edit">Sửa</button><button data-comment-action="delete">Xóa</button>' : ""}
          </div>
        </div>
      </div>`;
  }).join("") || '<div class="empty-state">Chưa có bình luận.</div>';
}

$("#comment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentCommentsPost?.comments_enabled) return;
  const content = $("#comment-input").value.trim();
  if (!content) return;

  const button = event.submitter;
  setBusy(button, true, "Đang gửi...");

  try {
    const { error } = await db.from("comments").insert({
      post_id: currentCommentsPost.id,
      author_id: currentUser.id,
      content
    });
    if (error) throw error;

    $("#comment-input").value = "";
    await loadComments();
    await loadFeed(true);
  } catch (error) {
    showToast("Không thể gửi bình luận: " + error.message);
  } finally {
    setBusy(button, false);
  }
});

$("#comments-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-comment-action]");
  if (!button) return;

  const row = button.closest("[data-comment-id]");
  const commentId = row.dataset.commentId;

  try {
    const { data: comment, error: readError } = await db.from("comments")
      .select("id,author_id,content").eq("id", commentId).single();
    if (readError) throw readError;

    const canManage = comment.author_id === currentUser.id || currentProfile?.role === "admin";
    if (!canManage) throw new Error("Bạn không có quyền sửa hoặc xóa bình luận này.");

    if (button.dataset.commentAction === "edit") {
      const updated = prompt("Chỉnh sửa bình luận:", comment.content);
      if (updated === null) return;
      if (!updated.trim()) return showToast("Bình luận không được để trống.");

      const { error } = await db.from("comments")
        .update({ content: updated.trim() }).eq("id", commentId);
      if (error) throw error;
    } else {
      if (!confirm("Bạn có chắc muốn xóa bình luận này?")) return;
      const { error } = await db.from("comments").delete().eq("id", commentId);
      if (error) throw error;
    }

    await loadComments();
    await loadFeed(true);
  } catch (error) {
    showToast(error.message || "Không thể xử lý bình luận.");
  }
});

/* ---------------- PROFILE ---------------- */

async function loadOwnProfileView() {
  if (!currentUser) return;
  try {
    await ensureProfile();
    const { data: links, error: linkError } = await db.from("social_links")
      .select("platform,url").eq("profile_id", currentUser.id);
    if (linkError) throw linkError;

    const safeLinks = (links || []).map(link => {
      const url = safeURL(link.url);
      if (!url) return "";
      const label = SOCIAL_PLATFORMS.find(p => p[0] === link.platform)?.[1] || link.platform;
      return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)}</a>`;
    }).join("");

    $("#profile-panel").innerHTML = `
      <img class="avatar huge" src="${escapeHTML(avatarURL(currentProfile))}" alt="">
      <h2>${escapeHTML(currentProfile.display_name || "Người dùng Hingram")}</h2>
      <p class="muted small-text">ID: ${escapeHTML(currentUser.id)}</p>
      <div class="profile-bio">${escapeHTML(currentProfile.bio || "Chưa có tiểu sử.")}</div>
      <div class="profile-links">${safeLinks}</div>
    `;

    const { data: posts, error } = await db.from("posts").select("*")
      .eq("author_id", currentUser.id).order("created_at", { ascending: false }).limit(30);
    if (error) throw error;

    $("#profile-posts").innerHTML = "";
    if (!posts.length) {
      $("#profile-posts").innerHTML = '<div class="empty-state">Bạn chưa đăng bài viết nào.</div>';
    } else {
      await renderPosts(posts, $("#profile-posts"));
    }
  } catch (error) {
    showToast("Không thể tải hồ sơ: " + error.message);
  }
}

function renderSettingsProfile() {
  $("#settings-profile").innerHTML = `
    <img class="avatar huge" src="${escapeHTML(avatarURL(currentProfile))}" alt="">
    <h3>${escapeHTML(currentProfile?.display_name || "Tài khoản")}</h3>
    <p class="muted small-text">${escapeHTML(currentUser?.email || "")}</p>
    <p class="muted small-text">${currentProfile?.role === "admin" ? "Quản trị viên" : "Thành viên"}</p>
  `;
}

async function openProfileEditor() {
  if (!currentUser) return;
  await ensureProfile();

  $("#edit-display-name").value = currentProfile.display_name || "";
  $("#edit-bio").value = currentProfile.bio || "";
  $("#edit-theme").value = currentProfile.theme || "system";
  $("#edit-avatar-preview").src = avatarURL(currentProfile);
  selectedAvatarFile = null;
  $("#avatar-file").value = "";

  const { data: links, error } = await db.from("social_links")
    .select("platform,url").eq("profile_id", currentUser.id);
  if (error) return showToast(error.message);

  const byPlatform = Object.fromEntries((links || []).map(link => [link.platform, link.url]));
  $("#social-links-editor").innerHTML = SOCIAL_PLATFORMS.map(([key, label]) => `
    <div class="social-row">
      <label for="social-${key}">${label}</label>
      <input id="social-${key}" type="url" data-social-platform="${key}"
             value="${escapeHTML(byPlatform[key] || "")}" placeholder="https://...">
    </div>
  `).join("");

  hideModal("settings-modal");
  showModal("profile-modal");
}

$("#avatar-file").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("Ảnh đại diện chỉ hỗ trợ JPG, PNG hoặc WEBP.");
    event.target.value = "";
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showToast("Ảnh đại diện phải nhỏ hơn 8 MB.");
    event.target.value = "";
    return;
  }
  selectedAvatarFile = file;
  $("#edit-avatar-preview").src = URL.createObjectURL(file);
});

$("#save-profile-btn").addEventListener("click", async () => {
  const button = $("#save-profile-btn");
  const displayName = $("#edit-display-name").value.trim();
  const bio = $("#edit-bio").value.trim();
  const theme = $("#edit-theme").value;

  if (displayName.length < 2) {
    showToast("Tên hiển thị cần có ít nhất 2 ký tự.");
    return;
  }

  setBusy(button, true, "Đang lưu...");
  try {
    let avatar_url = currentProfile.avatar_url;
    if (selectedAvatarFile) {
      avatar_url = await uploadImage(selectedAvatarFile, "avatars");
    }

    const { error: profileError } = await db.from("profiles").update({
      display_name: displayName,
      bio,
      theme,
      avatar_url
    }).eq("id", currentUser.id);
    if (profileError) throw profileError;

    for (const [platform] of SOCIAL_PLATFORMS) {
      const input = $(`[data-social-platform="${platform}"]`);
      const rawURL = input.value.trim();

      if (!rawURL) {
        const { error } = await db.from("social_links")
          .delete().eq("profile_id", currentUser.id).eq("platform", platform);
        if (error) throw error;
        continue;
      }

      const url = safeURL(rawURL);
      if (!url) throw new Error(`Liên kết ${platform} không hợp lệ. Hãy nhập URL bắt đầu bằng http:// hoặc https://.`);

      const { error } = await db.from("social_links").upsert({
        profile_id: currentUser.id,
        platform,
        url
      }, { onConflict: "profile_id,platform" });
      if (error) throw error;
    }

    await ensureProfile();
    setProfileImages();
    applyCurrentTheme();
    hideModal("profile-modal");
    await loadOwnProfileView();
    await loadFeed(true);
    showToast("Đã lưu hồ sơ.");
  } catch (error) {
    showToast("Không thể lưu hồ sơ: " + error.message);
  } finally {
    setBusy(button, false);
  }
});

/* ---------------- MODALS / STARTUP ---------------- */

$$("[data-close]").forEach(button => {
  button.addEventListener("click", () => hideModal(button.dataset.close));
});

$$(".modal").forEach(modal => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.classList.add("hidden");
  });
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if ((currentProfile?.theme || "system") === "system") applyCurrentTheme();
});

async function initialize() {
  if (SUPABASE_URL.includes("YOUR_SUPABASE") ||
      SUPABASE_KEY.includes("YOUR_SUPABASE")) {
    showAuth();
    showToast("Hãy nhập Project URL và Publishable key vào app.js.", 7000);
    return;
  }

  const { data, error } = await db.auth.getSession();
  if (error) {
    showToast("Không thể kiểm tra phiên đăng nhập: " + error.message);
    showAuth();
    return;
  }

  await handleAuthState(data.session);
}

initialize();

