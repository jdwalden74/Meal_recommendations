FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy data files
COPY data/food.csv          data/food.csv
COPY data/food_category.csv data/food_category.csv
COPY data/food_nutrient.csv data/food_nutrient.csv
COPY data/nutrient.csv      data/nutrient.csv

# Copy scripts
COPY preprocess.py .
COPY train.py      .
COPY main.py       .

# Preprocess and train at build time so the image ships ready to serve
RUN python preprocess.py && python train.py

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
