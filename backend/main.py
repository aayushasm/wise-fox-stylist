from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
import vertexai
from vertexai.preview.generative_models import GenerativeModel
import json
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Vertex AI
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "your-project-id")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

try:
    vertexai.init(project=PROJECT_ID, location=LOCATION)
    model = GenerativeModel("gemini-pro")
    logger.info(f"Vertex AI initialized for project {PROJECT_ID} in {LOCATION}")
except Exception as e:
    logger.warning(f"Vertex AI initialization failed: {e}. Some features may not work.")
    model = None

# FastAPI app
app = FastAPI(title="Serverless Stylist Agent", version="1.0.0")

# CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Models
class Product(BaseModel):
    id: int
    name: str
    description: str
    price: float

class PersonalizeRequest(BaseModel):
    style_profile: str
    wardrobe: str
    product_list: List[Product]

class StylistNotes(BaseModel):
    style_match: str = Field(description="High, Medium, or Low")
    wardrobe_compatibility: str = Field(description="High, Medium, or Low")
    reason: str = Field(description="A 1-sentence explanation")

class AnnotatedProduct(Product):
    stylist_notes: StylistNotes

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "model_initialized": model is not None}

def get_stylist_notes(style_profile: str, wardrobe: str, product: Product) -> StylistNotes:
    """
    Call Vertex AI Gemini to analyze a product based on style profile and wardrobe.
    Returns StylistNotes with style_match, wardrobe_compatibility, and reason.
    """
    if model is None:
        # Fallback to heuristic scoring if model not available
        logger.warning("Model not available, using fallback scoring")
        return fallback_scoring(style_profile, wardrobe, product)
    
    # System prompt
    system_prompt = """You are an expert e-commerce fashion stylist. Your goal is to analyze a product based on a user's style and their current wardrobe. You must perform two tasks:
1. **Style Match:** Score how well the product fits the user's 'style_profile'.
2. **Wardrobe Compatibility:** Score how well the product complements the *specific items* in the user's 'wardrobe'.

You must return *only* a single, valid JSON object with three keys:
1. "style_match": A score ("High", "Medium", or "Low").
2. "wardrobe_compatibility": A score ("High", "Medium", or "Low").
3. "reason": A single-sentence explanation for your scores, mentioning a specific wardrobe item if relevant (e.g., "This matches your 'vintage' style and would pair well with your 'black denim pants'.")."""

    # User prompt
    user_prompt = f"""USER'S PROFILE:
- Style: "{style_profile}"
- Wardrobe: "{wardrobe}"

PRODUCT TO ANALYZE:
- Name: "{product.name}"
- Description: "{product.description}"

Provide your analysis as a single, valid JSON object only."""

    try:
        # Call Gemini model
        response = model.generate_content(
            f"{system_prompt}\n\n{user_prompt}\n\nReturn only valid JSON, no markdown, no code blocks."
        )
        
        # Extract JSON from response
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()
        if response_text.endswith("```"):
            response_text = response_text.rsplit("```")[0].strip()
        
        # Parse JSON
        notes_dict = json.loads(response_text)
        
        # Validate and create StylistNotes
        style_match = notes_dict.get("style_match", "Medium")
        wardrobe_compatibility = notes_dict.get("wardrobe_compatibility", "Medium")
        reason = notes_dict.get("reason", "Analysis completed.")
        
        # Ensure valid values
        if style_match not in ["High", "Medium", "Low"]:
            style_match = "Medium"
        if wardrobe_compatibility not in ["High", "Medium", "Low"]:
            wardrobe_compatibility = "Medium"
        
        return StylistNotes(
            style_match=style_match,
            wardrobe_compatibility=wardrobe_compatibility,
            reason=reason
        )
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON parsing error: {e}. Response text: {response_text}")
        return fallback_scoring(style_profile, wardrobe, product)
    except Exception as e:
        logger.error(f"Error calling Gemini model: {e}")
        return fallback_scoring(style_profile, wardrobe, product)

def fallback_scoring(style_profile: str, wardrobe: str, product: Product) -> StylistNotes:
    """
    Fallback heuristic scoring when AI model is unavailable.
    """
    style_keywords = set(style_profile.lower().split())
    wardrobe_keywords = set(wardrobe.lower().split())
    product_text = f"{product.name} {product.description}".lower()
    product_keywords = set(product_text.split())
    
    # Style match: check keyword overlap
    style_overlap = len(style_keywords.intersection(product_keywords))
    style_ratio = style_overlap / max(len(style_keywords), 1)
    
    if style_ratio > 0.3:
        style_match = "High"
    elif style_ratio > 0.1:
        style_match = "Medium"
    else:
        style_match = "Low"
    
    # Wardrobe compatibility: check if product complements wardrobe items
    wardrobe_overlap = len(wardrobe_keywords.intersection(product_keywords))
    wardrobe_ratio = wardrobe_overlap / max(len(wardrobe_keywords), 1)
    
    if wardrobe_ratio > 0.2:
        wardrobe_compatibility = "High"
    elif wardrobe_ratio > 0.05:
        wardrobe_compatibility = "Medium"
    else:
        wardrobe_compatibility = "Low"
    
    reason = f"Style match: {style_match} (overlap: {style_overlap} keywords). Wardrobe compatibility: {wardrobe_compatibility} (overlap: {wardrobe_overlap} keywords)."
    
    return StylistNotes(
        style_match=style_match,
        wardrobe_compatibility=wardrobe_compatibility,
        reason=reason
    )

@app.post("/personalize-with-wardrobe", response_model=List[AnnotatedProduct])
async def personalize_with_wardrobe(request: PersonalizeRequest):
    """
    Main endpoint: analyzes each product and returns annotated list.
    """
    if not request.product_list:
        raise HTTPException(status_code=400, detail="product_list cannot be empty")
    
    annotated_list = []
    
    for product in request.product_list:
        try:
            # Get AI analysis for this product
            stylist_notes = get_stylist_notes(
                request.style_profile,
                request.wardrobe,
                product
            )
            
            # Create annotated product
            annotated_product = AnnotatedProduct(
                id=product.id,
                name=product.name,
                description=product.description,
                price=product.price,
                stylist_notes=stylist_notes
            )
            
            annotated_list.append(annotated_product)
            
        except Exception as e:
            logger.error(f"Error processing product {product.id}: {e}")
            # Include product with fallback notes on error
            fallback_notes = fallback_scoring(
                request.style_profile,
                request.wardrobe,
                product
            )
            annotated_list.append(AnnotatedProduct(
                **product.dict(),
                stylist_notes=fallback_notes
            ))
    
    return annotated_list

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)

