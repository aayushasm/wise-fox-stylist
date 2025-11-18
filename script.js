// Firebase Configuration
// TODO: Replace with your actual Firebase config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Backend API URL (adjust for your Cloud Run service)
const BACKEND_URL = 'http://localhost:8080'; // Change to your Cloud Run URL in production

// Mock Product Data
const mockProducts = [
    { id: 1, name: "Vintage Band T-Shirt", description: "A soft, faded black cotton t-shirt with a retro band logo.", price: 29.99 },
    { id: 2, name: "Dark Selvedge Denim Jeans", description: "Classic straight-fit jeans in deep indigo with selvedge detailing.", price: 89.99 },
    { id: 3, name: "Leather Combat Boots", description: "Genuine leather boots with chunky sole and lace-up design.", price: 149.99 },
    { id: 4, name: "Minimalist White Sneakers", description: "Clean, simple white canvas sneakers with rubber sole.", price: 59.99 },
    { id: 5, name: "Oversized Flannel Shirt", description: "Comfortable red and black plaid flannel shirt, perfect for layering.", price: 44.99 },
    { id: 6, name: "Black Slim-Fit Chinos", description: "Modern black chinos with stretch fabric and tapered leg.", price: 69.99 },
    { id: 7, name: "Vintage Denim Jacket", description: "Classic blue denim jacket with worn-in look and metal buttons.", price: 79.99 },
    { id: 8, name: "Brown Leather Belt", description: "Genuine leather belt with classic buckle, 1.5 inches wide.", price: 34.99 },
    { id: 9, name: "Graphic Print Hoodie", description: "Comfortable gray hoodie with bold graphic print on front.", price: 54.99 },
    { id: 10, name: "Cargo Pants", description: "Olive green cargo pants with multiple pockets and relaxed fit.", price: 64.99 },
    { id: 11, name: "Canvas Backpack", description: "Durable canvas backpack with leather straps and multiple compartments.", price: 49.99 },
    { id: 12, name: "Wool Beanie", description: "Warm gray wool beanie, perfect for cold weather.", price: 19.99 },
    { id: 13, name: "Plaid Button-Down Shirt", description: "Classic blue and white plaid shirt, perfect for casual or smart-casual looks.", price: 39.99 },
    { id: 14, name: "High-Top Sneakers", description: "Black high-top sneakers with white sole and retro styling.", price: 74.99 },
    { id: 15, name: "Corduroy Jacket", description: "Brown corduroy jacket with ribbed texture and button closure.", price: 84.99 }
];

const USER_ID = 'user_123';

// DOM Elements
const styleProfileInput = document.getElementById('style-profile');
const wardrobeInput = document.getElementById('wardrobe');
const personalizeBtn = document.getElementById('personalize-btn');
const productListContainer = document.getElementById('product-list-container');
const loader = document.getElementById('loader');

/**
 * On page load: render products and load saved profile
 */
function onPageLoad() {
    // Render products in default unsorted state
    renderProducts(mockProducts);
    
    // Load saved profile from Firestore
    loadProfile(USER_ID);
}

/**
 * Load user profile from Firestore
 */
async function loadProfile(userId) {
    try {
        const docRef = db.collection('user_profiles').doc(userId);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            styleProfileInput.value = data.style_profile || '';
            wardrobeInput.value = data.wardrobe || '';
            
            // If both fields have data, automatically personalize
            if (data.style_profile && data.wardrobe) {
                personalizePage(data.style_profile, data.wardrobe);
            }
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

/**
 * Save user profile to Firestore
 */
async function saveProfile(userId, profile, wardrobe) {
    try {
        await db.collection('user_profiles').doc(userId).set({
            style_profile: profile,
            wardrobe: wardrobe
        });
        console.log('Profile saved successfully');
    } catch (error) {
        console.error('Error saving profile:', error);
        throw error;
    }
}

/**
 * Main personalization function - calls backend agent
 */
async function personalizePage(profile, wardrobe) {
    // Show loader, hide product list
    loader.classList.remove('hidden');
    productListContainer.style.display = 'none';
    personalizeBtn.disabled = true;
    
    try {
        // Prepare payload
        const payload = {
            style_profile: profile,
            wardrobe: wardrobe,
            product_list: mockProducts
        };
        
        // Call backend
        const response = await fetch(`${BACKEND_URL}/personalize-with-wardrobe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Backend responded with status ${response.status}`);
        }
        
        const annotatedProducts = await response.json();
        
        // Sort products: High style_match and High wardrobe_compatibility first
        const sortedProducts = annotatedProducts.sort((a, b) => {
            const aStyle = a.stylist_notes.style_match === 'High' ? 3 : 
                          a.stylist_notes.style_match === 'Medium' ? 2 : 1;
            const bStyle = b.stylist_notes.style_match === 'High' ? 3 : 
                          b.stylist_notes.style_match === 'Medium' ? 2 : 1;
            
            const aWardrobe = a.stylist_notes.wardrobe_compatibility === 'High' ? 3 : 
                            a.stylist_notes.wardrobe_compatibility === 'Medium' ? 2 : 1;
            const bWardrobe = b.stylist_notes.wardrobe_compatibility === 'High' ? 3 : 
                            b.stylist_notes.wardrobe_compatibility === 'Medium' ? 2 : 1;
            
            // Prioritize products with both High scores
            const aTotal = aStyle + aWardrobe;
            const bTotal = bStyle + bWardrobe;
            
            if (aTotal !== bTotal) {
                return bTotal - aTotal;
            }
            
            // If totals are equal, prioritize style_match
            return bStyle - aStyle;
        });
        
        // Render sorted products
        renderProducts(sortedProducts);
        
    } catch (error) {
        console.error('Error personalizing page:', error);
        alert('Failed to personalize. Please check your backend connection and try again.');
    } finally {
        // Hide loader, show product list
        loader.classList.add('hidden');
        productListContainer.style.display = 'grid';
        personalizeBtn.disabled = false;
    }
}

/**
 * Render products in the product list container
 */
function renderProducts(products) {
    productListContainer.innerHTML = '';
    
    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        
        card.innerHTML = `
            <h3>${product.name}</h3>
            <div class="price">$${product.price.toFixed(2)}</div>
            <div class="description">${product.description}</div>
        `;
        
        // Add stylist notes if they exist
        if (product.stylist_notes) {
            const notes = product.stylist_notes;
            
            // Add match badges
            const badgesDiv = document.createElement('div');
            badgesDiv.className = 'match-badges';
            
            const styleBadge = document.createElement('span');
            styleBadge.className = `match-badge ${notes.style_match.toLowerCase()}`;
            styleBadge.textContent = `Style: ${notes.style_match}`;
            badgesDiv.appendChild(styleBadge);
            
            const wardrobeBadge = document.createElement('span');
            wardrobeBadge.className = `match-badge ${notes.wardrobe_compatibility.toLowerCase()}`;
            wardrobeBadge.textContent = `Wardrobe: ${notes.wardrobe_compatibility}`;
            badgesDiv.appendChild(wardrobeBadge);
            
            card.appendChild(badgesDiv);
            
            // Add stylist note with reason
            const noteDiv = document.createElement('div');
            noteDiv.className = 'stylist-note';
            noteDiv.innerHTML = `<strong>Stylist's Note:</strong> ${notes.reason}`;
            card.appendChild(noteDiv);
        }
        
        productListContainer.appendChild(card);
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', onPageLoad);

personalizeBtn.addEventListener('click', async () => {
    const profile = styleProfileInput.value.trim();
    const wardrobe = wardrobeInput.value.trim();
    
    if (!profile || !wardrobe) {
        alert('Please fill in both your style profile and wardrobe.');
        return;
    }
    
    try {
        // Save to Firestore
        await saveProfile(USER_ID, profile, wardrobe);
        
        // Personalize page
        await personalizePage(profile, wardrobe);
    } catch (error) {
        console.error('Error in personalize button handler:', error);
        alert('Failed to save profile. Please try again.');
    }
});

